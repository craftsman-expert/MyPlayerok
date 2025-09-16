

## 1 Запуск локально

В корне проекта выполнить:
```shell
php -S localhost:8000 -t public/
```
## 2 Запуск базы данных

В любом месте WSL
```shell
docker run --rm \
  --name mysql-myplayerok \
  -e MYSQL_DATABASE=myplayerok \
  -e MYSQL_USER=vokintos \
  -e MYSQL_PASSWORD=111 \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -v mysql-data:/var/lib/mysql \
  -p 3307:3306 \
  mysql:8

