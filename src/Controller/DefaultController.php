<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

class DefaultController extends AbstractController
{
    #[Route('/', name: 'home')]
    public function index(): Response
    {
        return new Response('
            <!DOCTYPE html>
            <html>
            <head>
                <title>Музыкальный плеер</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    h1 { color: #333; }
                </style>
            </head>
            <body>
                <h1>🎵 Добро пожаловать в MyPlayerok!</h1>
                <p>Ваш музыкальный плеер на Symfony</p>
                <p><a href="/track/">Управление треками</a></p>
            </body>
            </html>
        ');
    }
}