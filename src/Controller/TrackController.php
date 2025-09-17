<?php

namespace App\Controller;

use App\Entity\Track;
use App\Form\TrackType;
use App\Repository\TrackRepository;
use App\Service\TrackManager;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/track')]
class TrackController extends AbstractController
{
    #[Route('/', name: 'app_track_index', methods: ['GET'])]
    public function index(TrackRepository $trackRepository): Response
    {
        $tracks = $trackRepository->findBy([], ['id' => 'DESC']);

        return $this->render('track/index.html.twig', [
            'tracks' => $tracks,
            'defaults' => [
                'title' => TrackManager::UNKNOWN_TITLE,
                'artist' => TrackManager::UNKNOWN_ARTIST,
                'album' => TrackManager::UNKNOWN_ALBUM,
            ],
        ]);
    }

    #[Route('/new', name: 'app_track_new', methods: ['GET', 'POST'])]
    public function new(Request $request, EntityManagerInterface $entityManager, TrackManager $trackManager): Response
    {
        $track = new Track();
        $form = $this->createForm(TrackType::class, $track, [
            'require_audio_file' => true,
        ]);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $audioFile = $form->get('audioFile')->getData();

            if ($audioFile) {
                $trackManager->handleUpload($track, $audioFile);
                $trackManager->ensureDefaults($track, $audioFile->getClientOriginalName());
            } else {
                $trackManager->ensureDefaults($track);
            }

            $entityManager->persist($track);
            $entityManager->flush();

            $this->addFlash('success', 'Трек успешно добавлен.');

            return $this->redirectToRoute('app_track_index', [], Response::HTTP_SEE_OTHER);
        }

        return $this->renderForm('track/new.html.twig', [
            'track' => $track,
            'form' => $form,
            'defaults' => [
                'title' => TrackManager::UNKNOWN_TITLE,
                'artist' => TrackManager::UNKNOWN_ARTIST,
                'album' => TrackManager::UNKNOWN_ALBUM,
            ],
        ]);
    }

    #[Route('/{id}', name: 'app_track_show', methods: ['GET'])]
    public function show(Track $track): Response
    {
        return $this->render('track/show.html.twig', [
            'track' => $track,
            'defaults' => [
                'title' => TrackManager::UNKNOWN_TITLE,
                'artist' => TrackManager::UNKNOWN_ARTIST,
                'album' => TrackManager::UNKNOWN_ALBUM,
            ],
        ]);
    }

    #[Route('/{id}/edit', name: 'app_track_edit', methods: ['GET', 'POST'])]
    public function edit(Request $request, Track $track, EntityManagerInterface $entityManager, TrackManager $trackManager): Response
    {
        $form = $this->createForm(TrackType::class, $track);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $audioFile = $form->get('audioFile')->getData();

            if ($audioFile) {
                $trackManager->handleUpload($track, $audioFile, true);
                $trackManager->ensureDefaults($track, $audioFile->getClientOriginalName());
            } else {
                $trackManager->ensureDefaults($track);
            }

            $entityManager->flush();

            $this->addFlash('success', 'Трек обновлён.');

            return $this->redirectToRoute('app_track_index', [], Response::HTTP_SEE_OTHER);
        }

        return $this->renderForm('track/edit.html.twig', [
            'track' => $track,
            'form' => $form,
            'defaults' => [
                'title' => TrackManager::UNKNOWN_TITLE,
                'artist' => TrackManager::UNKNOWN_ARTIST,
                'album' => TrackManager::UNKNOWN_ALBUM,
            ],
        ]);
    }

    #[Route('/{id}', name: 'app_track_delete', methods: ['POST'])]
    public function delete(Request $request, Track $track, EntityManagerInterface $entityManager, TrackManager $trackManager): Response
    {
        if ($this->isCsrfTokenValid('delete'.$track->getId(), $request->request->get('_token'))) {
            $trackManager->removeMedia($track);
            $entityManager->remove($track);
            $entityManager->flush();

            $this->addFlash('success', 'Трек удалён.');
        }

        return $this->redirectToRoute('app_track_index', [], Response::HTTP_SEE_OTHER);
    }
}
