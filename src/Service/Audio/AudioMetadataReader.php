<?php

namespace App\Service\Audio;

use function array_key_exists;
use function array_merge;
use function fclose;
use function fopen;
use function fread;
use function fseek;
use function is_file;
use function is_numeric;
use function is_readable;
use function mb_convert_encoding;
use function ord;
use function preg_match;
use function strlen;
use function strpos;
use function substr;
use const SEEK_END;

class AudioMetadataReader
{
    private const GENRES = [
        'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal',
        'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial',
        'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk',
        'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise',
        'Alternative Rock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic',
        'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta',
        'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native US', 'Cabaret', 'New Wave', 'Psychadelic', 'Rave', 'Showtunes',
        'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock',
        'Folk', 'Folk-Rock', 'National Folk', 'Swing', 'Fast Fusion', 'Bebob', 'Latin', 'Revival', 'Celtic', 'Bluegrass',
        'Avantgarde', 'Gothic Rock', 'Progressive Rock', 'Psychedelic Rock', 'Symphonic Rock', 'Slow Rock', 'Big Band', 'Chorus', 'Easy Listening', 'Acoustic',
        'Humour', 'Speech', 'Chanson', 'Opera', 'Chamber Music', 'Sonata', 'Symphony', 'Booty Bass', 'Primus', 'Porn Groove',
        'Satire', 'Slow Jam', 'Club', 'Tango', 'Samba', 'Folklore', 'Ballad', 'Power Ballad', 'Rhythmic Soul', 'Freestyle',
        'Duet', 'Punk Rock', 'Drum Solo', 'Acapella', 'Euro-House', 'Dance Hall'
    ];

    public function extract(string $filePath): AudioMetadata
    {
        if (!is_file($filePath) || !is_readable($filePath)) {
            return AudioMetadata::empty();
        }

        $metadata = $this->readId3v2($filePath);
        $fallback = $this->readId3v1($filePath);
        $merged = array_merge($fallback, $metadata);

        return new AudioMetadata(
            $this->sanitizeString($merged['title'] ?? null),
            $this->sanitizeString($merged['artist'] ?? null),
            $this->sanitizeString($merged['album'] ?? null),
            $this->sanitizeString($merged['genre'] ?? null),
            isset($merged['duration']) && is_numeric($merged['duration']) ? (int) $merged['duration'] : null,
            $merged['cover'] ?? null
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function readId3v2(string $filePath): array
    {
        $handle = @fopen($filePath, 'rb');
        if (!$handle) {
            return [];
        }

        $header = fread($handle, 10);
        if (strlen($header) < 10 || substr($header, 0, 3) !== 'ID3') {
            fclose($handle);
            return [];
        }

        $version = ord($header[3]);
        $size = $this->decodeSyncSafe(substr($header, 6, 4));
        $tagData = fread($handle, $size);
        fclose($handle);

        $offset = 0;
        $result = [];
        $length = strlen($tagData);

        while ($offset + 10 <= $length) {
            $frameId = substr($tagData, $offset, 4);
            if ($frameId === "\0\0\0\0" || trim($frameId) === '') {
                break;
            }

            $rawSize = substr($tagData, $offset + 4, 4);
            $frameSize = $version >= 4 ? $this->decodeSyncSafe($rawSize) : $this->decodeBigEndian($rawSize);

            if ($frameSize <= 0 || $offset + 10 + $frameSize > $length) {
                break;
            }

            $frameData = substr($tagData, $offset + 10, $frameSize);
            $offset += 10 + $frameSize;

            switch ($frameId) {
                case 'TIT2':
                    $result['title'] = $this->decodeTextFrame($frameData);
                    break;
                case 'TPE1':
                    $result['artist'] = $this->decodeTextFrame($frameData);
                    break;
                case 'TALB':
                    $result['album'] = $this->decodeTextFrame($frameData);
                    break;
                case 'TCON':
                    $result['genre'] = $this->normalizeGenre($this->decodeTextFrame($frameData));
                    break;
                case 'TLEN':
                    $durationText = $this->decodeTextFrame($frameData);
                    if ($durationText && is_numeric($durationText)) {
                        $result['duration'] = (int) round(((int) $durationText) / 1000);
                    }
                    break;
                case 'APIC':
                    $cover = $this->extractCover($frameData);
                    if ($cover) {
                        $result['cover'] = $cover;
                    }
                    break;
                default:
                    break;
            }
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    private function readId3v1(string $filePath): array
    {
        $handle = @fopen($filePath, 'rb');
        if (!$handle) {
            return [];
        }

        if (fseek($handle, -128, SEEK_END) !== 0) {
            fclose($handle);
            return [];
        }

        $buffer = fread($handle, 128);
        fclose($handle);

        if (strlen($buffer) !== 128 || substr($buffer, 0, 3) !== 'TAG') {
            return [];
        }

        $title = $this->trimNullBytes(substr($buffer, 3, 30));
        $artist = $this->trimNullBytes(substr($buffer, 33, 30));
        $album = $this->trimNullBytes(substr($buffer, 63, 30));
        $genreIndex = ord($buffer[127]);
        $genre = self::GENRES[$genreIndex] ?? null;

        return array_filter([
            'title' => $title ?: null,
            'artist' => $artist ?: null,
            'album' => $album ?: null,
            'genre' => $genre,
        ], static fn ($value) => $value !== null);
    }

    private function decodeSyncSafe(string $bytes): int
    {
        $value = 0;
        $length = strlen($bytes);
        for ($i = 0; $i < $length; ++$i) {
            $value = ($value << 7) | (ord($bytes[$i]) & 0x7F);
        }

        return $value;
    }

    private function decodeBigEndian(string $bytes): int
    {
        $unpacked = unpack('N', $bytes);

        return $unpacked ? (int) $unpacked[1] : 0;
    }

    private function decodeTextFrame(string $data): ?string
    {
        if ($data === '') {
            return null;
        }

        $encoding = ord($data[0]);
        $content = substr($data, 1);

        return $this->convertEncoding($content, $encoding);
    }

    private function normalizeGenre(?string $genre): ?string
    {
        if ($genre === null) {
            return null;
        }

        $clean = trim(str_replace(['\\0', "\0"], '', $genre));
        if ($clean === '') {
            return null;
        }

        if (preg_match('/\((\d+)\)/', $clean, $matches)) {
            $index = (int) $matches[1];
            if (array_key_exists($index, self::GENRES)) {
                return self::GENRES[$index];
            }
        }

        return trim($clean, ' ()');
    }

    private function extractCover(string $frameData): ?AudioCover
    {
        if ($frameData === '') {
            return null;
        }

        $encoding = ord($frameData[0]);
        $offset = 1;
        $mimeEnd = strpos($frameData, "\0", $offset);
        if ($mimeEnd === false) {
            return null;
        }

        $mime = substr($frameData, $offset, $mimeEnd - $offset) ?: 'image/jpeg';
        $offset = $mimeEnd + 1;

        if ($offset >= strlen($frameData)) {
            return null;
        }

        $offset += 1; // skip picture type

        $termination = ($encoding === 1 || $encoding === 2) ? "\0\0" : "\0";
        $descriptionEnd = strpos($frameData, $termination, $offset);
        if ($descriptionEnd === false) {
            $descriptionEnd = $offset;
        }

        $offset = $descriptionEnd + strlen($termination);
        $binary = substr($frameData, $offset);

        if ($binary === '') {
            return null;
        }

        return new AudioCover($mime, $binary);
    }

    private function convertEncoding(string $text, int $encoding): ?string
    {
        $text = str_replace("\0", '', $text);
        if ($text === '') {
            return null;
        }

        return match ($encoding) {
            0 => $this->toUtf8($text, 'ISO-8859-1'),
            1 => $this->toUtf8($text, 'UTF-16'),
            2 => $this->toUtf8($text, 'UTF-16BE'),
            3 => $this->toUtf8($text, 'UTF-8'),
            default => $this->toUtf8($text, 'UTF-8'),
        };
    }

    private function toUtf8(string $text, string $sourceEncoding): ?string
    {
        if ($text === '') {
            return null;
        }

        $converted = false;
        if (function_exists('mb_convert_encoding')) {
            $converted = @mb_convert_encoding($text, 'UTF-8', $sourceEncoding);
        }

        if ($converted === false && function_exists('iconv')) {
            $converted = @iconv($sourceEncoding, 'UTF-8//IGNORE', $text);
        }

        $result = $converted !== false ? $converted : $text;
        $result = trim(str_replace("\0", '', $result));

        return $result !== '' ? $result : null;
    }

    private function trimNullBytes(string $value): string
    {
        return trim(str_replace("\0", '', $value));
    }

    private function sanitizeString(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);
        if ($value === '') {
            return null;
        }

        return $value;
    }
}
