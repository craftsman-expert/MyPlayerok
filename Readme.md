

## 1 Запуск локально

В корне проекта выполнить:
```shell
php -S localhost:8000 -t public/
```
## 2 Запуск базы данных

В любом месте WSL
```shell
docker run --rm \
  --name cms.loc \
  -e MYSQL_DATABASE=cms \
  -e MYSQL_USER=dcms \
  -e MYSQL_PASSWORD=cms \
  -e MYSQL_ROOT_PASSWORD=cms \
  -v mysql-test-data:/var/lib/mysql \
  -p 3307:3307 \
  mysql:8

