<?php

namespace App\Controller;

use App\Entity\Track;
use App\Repository\TrackRepository;
use App\Service\TrackManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

class DefaultController extends AbstractController
{
    #[Route('/', name: 'home')]
    public function index(TrackRepository $trackRepository): Response
    {
        $tracks = $trackRepository->findBy([], ['id' => 'DESC']);

        return $this->render('home/index.html.twig', [
            'tracks' => $tracks,
            'artistCounts' => $this->groupByCounts($tracks, static fn (Track $track): ?string => $track->getArtist(), TrackManager::UNKNOWN_ARTIST),
            'albumCounts' => $this->groupByCounts($tracks, static fn (Track $track): ?string => $track->getAlbum(), TrackManager::UNKNOWN_ALBUM),
            'defaults' => [
                'title' => TrackManager::UNKNOWN_TITLE,
                'artist' => TrackManager::UNKNOWN_ARTIST,
                'album' => TrackManager::UNKNOWN_ALBUM,
            ],
        ]);
    }

    /**
     * @param array<int, Track> $tracks
     * @return array<string, int>
     */
    private function groupByCounts(array $tracks, callable $accessor, string $fallback): array
    {
        $counts = [];

        foreach ($tracks as $track) {
            $value = $accessor($track);
            $value = is_string($value) ? trim($value) : '';
            if ($value === '') {
                $value = $fallback;
            }

            $counts[$value] = ($counts[$value] ?? 0) + 1;
        }

        ksort($counts, SORT_NATURAL | SORT_FLAG_CASE);

        return $counts;
    }
}