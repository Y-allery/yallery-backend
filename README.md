<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Activity API

The supported user activity API is `/user-activity/*`:

- `GET /user-activity/types`
- `GET /user-activity/feed`
- `PATCH /user-activity/read-state`

The old `/activity/*` compatibility routes from `main` are intentionally not exposed on the refactor backend. The historical `activity` table is not dropped by this code cleanup; production data removal must be handled by a separate migration after the refactor flow is deployed and verified.

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).

# Y'allery Backend

## Image Generation API

### Edit Image Endpoint

**POST** `/image-generation/edit-image`

Редагує існуюче зображення за допомогою AI моделі `fal-ai/bytedance/seededit/v3/edit-image`.

#### Request Body

```json
{
  "image_url": "https://example.com/image.jpg",
  "prompt": "Make the sky more blue and add clouds"
}
```

#### Parameters

- `image_url` (string, required) - URL зображення для редагування
- `prompt` (string, required) - Текстовий опис змін, які потрібно внести до зображення

#### Response

```json
{
  "message": "Image editing task has been added to the queue.",
  "taskId": "3f2b6d1c-8a4e-4c1d-9f6b-2f1a7e5c9d10"
}
```

`taskId` повертається кожним генераційним ендпоінтом (`/media-generation/image/prompt`, `/media-generation/image/edit`, `/media-generation/audio/generate`, `/media-generation/video/text`, `/media-generation/video/image`, `/media-generation/meme/generate`) одразу після постановки задачі в чергу. Той самий `taskId` приходить у websocket-подіях завершення (`imageGenerated`, `imageEdited`, `videoGenerated`, `audioGenerated`, `memeGenerated` — поле верхнього рівня `taskId`) та в події помилки `mediaGenerationError` (поля `taskId` і `jobId`), тож фронт може зіставити відповідь HTTP з результатом генерації.

#### Features

- Використовує черги для асинхронної обробки
- Автоматично створює пост з відредагованим зображенням
- Прив'язує пост до користувача
- Списує кредити (25 кредитів за редагування)
- Відправляє повідомлення про завершення

#### Authentication

Потрібен JWT токен в заголовку `Authorization: Bearer <token>`

#### Example Usage

```bash
curl -X POST http://localhost:8000/image-generation/edit-image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/image.jpg",
    "prompt": "Change the background to a sunset"
  }'
```
