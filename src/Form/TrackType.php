<?php

namespace App\Form;

use App\Entity\Track;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\FileType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use Symfony\Component\Validator\Constraints\File;
use Symfony\Component\Validator\Constraints\NotBlank;

class TrackType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $audioConstraints = [
            new File([
                'mimeTypes' => [
                    'audio/mpeg',
                    'audio/mp3',
                    'audio/x-mpeg',
                    'audio/aac',
                    'audio/wav',
                    'audio/x-wav',
                    'audio/ogg',
                    'audio/flac',
                    'audio/webm',
                    'audio/x-ms-wma',
                ],
                'mimeTypesMessage' => 'Пожалуйста, загрузите корректный аудиофайл.',
            ]),
        ];

        if ($options['require_audio_file']) {
            $audioConstraints[] = new NotBlank([
                'message' => 'Добавьте аудиофайл.',
            ]);
        }

        $builder
            ->add('audioFile', FileType::class, [
                'label' => 'Аудиофайл',
                'mapped' => false,
                'required' => $options['require_audio_file'],
                'help' => 'MP3, WAV, OGG, FLAC, AAC, WEBM',
                'constraints' => $audioConstraints,
            ])
            ->add('title', TextType::class, [
                'required' => false,
                'label' => 'Название',
                'attr' => ['placeholder' => 'Название трека'],
            ])
            ->add('artist', TextType::class, [
                'required' => false,
                'label' => 'Исполнитель',
                'attr' => ['placeholder' => 'Имя артиста'],
            ])
            ->add('album', TextType::class, [
                'required' => false,
                'label' => 'Альбом',
                'attr' => ['placeholder' => 'Название альбома'],
            ])
            ->add('genre', TextType::class, [
                'required' => false,
                'label' => 'Жанр',
                'attr' => ['placeholder' => 'Жанр композиции'],
            ])
        ;
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => Track::class,
            'require_audio_file' => false,
        ]);
    }
}
