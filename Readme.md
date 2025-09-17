# MyPlayerok

Современный аудио-плеер на Symfony с поддержкой загрузки треков, чтения метаданных (исполнители, альбомы, обложки) и адаптивным интерфейсом на Bootstrap 5.

## Требования

* PHP >= 8.1 с расширениями `ctype`, `iconv`, `fileinfo`
* [Composer](https://getcomposer.org/)
* [Symfony CLI](https://symfony.com/download)
* Docker и Docker Compose v2 (для базы данных и вспомогательных сервисов)

## Подготовка окружения

1. Установите зависимости проекта:
   ```bash
   symfony composer install
   ```

2. При необходимости скорректируйте подключение к базе данных в `.env.local`:
   ```bash
   cp .env .env.local
   # затем измените значения MYSQL_* под свою среду
   ```

3. Запустите инфраструктурные сервисы (MySQL 8 и Mailpit) через Symfony CLI:
   ```bash
   symfony run -d --watch=config,src,templates,public docker compose up database mailer
   ```
   *По умолчанию MySQL слушает порт `3306`. Если порт занят, задайте другой перед запуском:*
   ```bash
   MYSQL_PORT=3307 symfony run -d --watch=config,src,templates,public docker compose up database mailer
   ```

4. Дождитесь, пока база данных станет доступна (healthcheck в `docker compose` проверяет готовность). Затем инициализируйте схему:
   ```bash
   symfony console doctrine:database:create --if-not-exists
   symfony console doctrine:migrations:migrate --no-interaction
   ```

## Запуск приложения

1. Запустите встроенный веб-сервер Symfony:
   ```bash
   symfony server:start -d
   ```

2. Откройте приложение по адресу, который выведет команда (обычно `https://127.0.0.1:8000`).

3. Для остановки сервисов выполните:
   ```bash
   symfony server:stop
   symfony run docker compose down
   ```

## Работа с треками

* Загружайте аудиофайлы формата MP3/M4A/FLAC через раздел «Треки». Сервис автоматически считает название, исполнителя, альбом, жанр, длительность и обложку из ID3-тегов. Если метаданные отсутствуют, будут подставлены понятные значения по умолчанию.
* Все файлы и обложки сохраняются в `public/uploads`. Каталог создаётся автоматически, но убедитесь, что у веб-сервера есть права на запись.

## Полезные команды

```bash
# Очистить кеш
symfony console cache:clear

# Проверить корректность конфигурации Doctrine
symfony console doctrine:schema:validate

# Запустить тесты
symfony php bin/phpunit
```

Готово! После выполнения шагов из этого файла приложение полностью готово к работе.
