## Admin metrics overview

### Загальна ідея

Цей механізм дає адмінам швидкий доступ до агрегованої статистики без важких ad‑hoc запитів напряму по бойових таблицях (`users`, `posts`, `likes` тощо).

- **Що рахуємо**: 
  - кількість нових користувачів і загальну кількість користувачів;
  - кількість нових постів, нових image‑постів, нових video‑постів;
  - загальну кількість постів (всього / тільки image / тільки video);
  - кількість активних користувачів за період (створювали пости);
  - кількість нових лайків та загальну кількість лайків;
  - розподіл нових постів на конкурсні / звичайні;
  - середню кількість лайків на новий пост;
  - розподіл нових постів за AI‑сервісами (image/video).
- **Як рахуємо**: кожну годину окремий cron‑джоб рахує метрики за **останній тиждень (останні 7 днів)** і записує один snapshot у таблицю `admin_metrics`.
- **Як читаємо**: admin‑ендпоінт завжди повертає **останній (найсвіжіший) тижневий snapshot** з `admin_metrics`.

---

### Таблиця `admin_metrics`

Таблиця створюється міграцією `1764700600000-create-admin-metrics.ts` та розширюється наступними міграціями:

- `1764700700000-extend-admin-metrics.ts`
- `1764700800000-extend-admin-metrics-v2.ts`

- **Назва таблиці**: `admin_metrics`
- **Призначення**: зберігати погодинні (але агреговані за тиждень) зрізи ключових метрик.

**Стовпці:**

- **id** (`int`, PK, auto increment) – унікальний ідентифікатор рядка.
- **periodStart** (`datetime`, NOT NULL, indexed) – початок періоду, за який пораховано метрики (7 днів тому від моменту snapshot’а).
- **periodEnd** (`datetime`, NOT NULL, indexed) – кінець періоду (момент створення snapshot’а).
- **snapshotTime** (`datetime`, NOT NULL, default `CURRENT_TIMESTAMP`) – час, коли був зроблений цей зріз.
- **newUsers** (`int`, default 0) – скільки **нових користувачів** зареєструвалися в інтервалі `[periodStart, periodEnd)`.
- **totalUsers** (`int`, default 0) – **загальна кількість користувачів** на момент `periodEnd`.
- **newPosts** (`int`, default 0) – скільки **нових постів** створено в інтервалі `[periodStart, periodEnd)`.
- **newImagePosts** (`int`, default 0) – скільки з цих постів мають **imageUrl != null / ''** (нові зображення).
- **newVideoPosts** (`int`, default 0) – скільки з цих постів мають **videoUrl != null / ''** (нові відео).
- **totalPosts** (`int`, default 0) – **загальна кількість постів** на момент `periodEnd`.
- **totalImagePosts** (`int`, default 0) – **загальна кількість image‑постів** на момент `periodEnd`.
- **totalVideoPosts** (`int`, default 0) – **загальна кількість video‑постів** на момент `periodEnd`.
- **activeUsers** (`int`, default 0) – скільки **унікальних користувачів створювали хоч один пост** в інтервалі `[periodStart, periodEnd)`.
- **newLikes** (`int`, default 0) – скільки нових лайків поставлено за період `[periodStart, periodEnd)`.
- **totalLikes** (`int`, default 0) – **загальна кількість лайків** на момент `periodEnd`.
- **newContestPosts** (`int`, default 0) – скільки нових постів за період було створено з прив’язкою до конкурсу (`contest IS NOT NULL`).
- **newRegularPosts** (`int`, default 0) – скільки нових постів за період було створено без конкурсу (`contest IS NULL`).
- **avgLikesPerPost** (`float`, default 0) – середня кількість лайків на один новий пост за період (нові лайки / нові пости).
- **aiStats** (`json`, nullable) – агрегована статистика по AI‑сервісах за період:
  - `aiStats.image` – об’єкт `ai_service -> { newPosts, totalPosts }` для image‑постів;
  - `aiStats.video` – об’єкт `ai_service -> { newPosts, totalPosts }` для video‑постів (зараз `totalPosts` завжди 0, зарезервовано під розширення).

---

### Cron‑джоб: погодинне оновлення метрик

Реалізовано у `AdminService` за допомогою `@nestjs/schedule`.

```84:169:src/admin/admin.service.ts
@Cron(CronExpression.EVERY_HOUR)
async collectAdminMetricsSnapshot() {
  const now = new Date();
  const periodEnd = new Date(now.getTime());
  // Фіксований період: останні 7 днів
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    newUsers,
    totalUsers,
    newPosts,
    newImagePosts,
    newVideoPosts,
    totalPosts,
    totalImagePosts,
    totalVideoPosts,
    newLikes,
    totalLikes,
  ] = await Promise.all([
    this.userRepository.count({
      where: {
        createdAt: Between(periodStart, periodEnd),
      },
    }),
    this.userRepository.count(),
    this.postRepository.count({
      where: {
        createdAt: Between(periodStart, periodEnd),
      },
    }),
    this.postRepository
      .createQueryBuilder('p')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
        empty: '',
      })
      .getCount(),
    this.postRepository
      .createQueryBuilder('p')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
        empty: '',
      })
      .getCount(),
    this.postRepository.count(),
    this.postRepository
      .createQueryBuilder('p')
      .where('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
        empty: '',
      })
      .getCount(),
    this.postRepository
      .createQueryBuilder('p')
      .where('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
        empty: '',
      })
      .getCount(),
    this.likeRepository.count({
      where: {
        createdAt: Between(periodStart, periodEnd),
      },
    }),
    this.likeRepository.count(),
  ]);

  const activeUsersRaw = await this.postRepository
    .createQueryBuilder('p')
    .select('COUNT(DISTINCT p.userId)', 'cnt')
    .where('p.createdAt >= :start AND p.createdAt < :end', {
      start: periodStart,
      end: periodEnd,
    })
    .getRawOne();

  const activeUsers = Number(activeUsersRaw?.cnt || 0);
  const newContestPosts = await this.postRepository.count({
    where: {
      createdAt: Between(periodStart, periodEnd),
      contest: { id: Between(1, Number.MAX_SAFE_INTEGER) } as any,
    } as any,
  });
  const newRegularPosts = newPosts - newContestPosts;
  const avgLikesPerPost =
    newPosts > 0 ? Number((newLikes / newPosts).toFixed(2)) : 0;

  const snapshot = this.adminMetricsRepository.create({
    periodStart,
    periodEnd,
    newUsers,
    totalUsers,
    newPosts,
    newImagePosts,
    newVideoPosts,
    totalPosts,
    totalImagePosts,
    totalVideoPosts,
    activeUsers,
    newLikes,
    totalLikes,
    newContestPosts,
    newRegularPosts,
    avgLikesPerPost,
  });

  await this.adminMetricsRepository.save(snapshot);
}
```

**Важливі моменти:**

- Період `periodStart/periodEnd` завжди покриває **останні 7 днів** від моменту запуску крону.
- Кожну годину створюється **новий тижневий snapshot**, який відображає стан за останні 7 днів.
- Поля `totalUsers`, `totalPosts`, `totalLikes` тощо відображають стан «на кінець періоду» (`periodEnd`).

---

### Admin‑ендпоінт: `GET /admin/metrics/overview`

Ендпоінт визначено в `AdminController` і доступний тільки для **ADMIN**‑ролі (успадковує загальний guard для всього `@Controller('admin')`).

```375:507:src/admin/admin.controller.ts
@Get('metrics/overview')
@ApiOperation({
  summary: 'Get aggregated admin metrics',
  description:
    'Returns high-level aggregated metrics (users, posts, likes) for a fixed rolling 7-day period. ' +
    'Data is pre-aggregated hourly by a background cron job; the endpoint always returns the latest weekly snapshot.',
})
@ApiResponse({
  status: 200,
  description: 'Aggregated 7-day metrics overview returned successfully.',
})
async getAdminMetricsOverview() {
  return this.adminService.getAdminMetricsOverview();
}
```

Вся бізнес‑логіка збору метрик винесена в `AdminService.collectAdminMetricsSnapshot`, а читання останнього snapshot’а – в `AdminService.getAdminMetricsOverview`.

```185:225:src/admin/admin.service.ts
async getAdminMetricsOverview() {
  const latest = await this.adminMetricsRepository
    .createQueryBuilder('m')
    .orderBy('m.snapshotTime', 'DESC')
    .limit(1)
    .getOne();

  if (!latest) {
    return {
      from: null,
      to: null,
      newUsers: 0,
      totalUsers: 0,
      newPosts: 0,
      newImagePosts: 0,
      newVideoPosts: 0,
      totalPosts: 0,
      totalImagePosts: 0,
      totalVideoPosts: 0,
      activeUsers: 0,
      newLikes: 0,
      totalLikes: 0,
      newContestPosts: 0,
      newRegularPosts: 0,
      avgLikesPerPost: 0,
    };
  }

  return {
    from: latest.periodStart,
    to: latest.periodEnd,
    newUsers: latest.newUsers,
    totalUsers: latest.totalUsers,
    newPosts: latest.newPosts,
    newImagePosts: latest.newImagePosts,
    newVideoPosts: latest.newVideoPosts,
    totalPosts: latest.totalPosts,
    totalImagePosts: latest.totalImagePosts,
    totalVideoPosts: latest.totalVideoPosts,
    activeUsers: latest.activeUsers,
    newLikes: latest.newLikes,
    totalLikes: latest.totalLikes,
    newContestPosts: latest.newContestPosts,
    newRegularPosts: latest.newRegularPosts,
    avgLikesPerPost: latest.avgLikesPerPost,
  };
}
```

---

### Admin‑ендпоінт: `POST /admin/metrics/recalculate`

Додатковий службовий ендпоінт для адмінів, який дозволяє **зафорсити** перерахунок метрик без очікування наступного запуску крону.

```430:452:src/admin/admin.controller.ts
@Post('metrics/recalculate')
@ApiOperation({
  summary: 'Force recalculate 7-day admin metrics snapshot',
  description:
    'Triggers the same logic as the hourly cron job to immediately recalculate and store a fresh 7-day metrics snapshot.',
})
@ApiResponse({
  status: 200,
  description: 'Metrics snapshot recalculated successfully.',
})
async recalculateAdminMetrics() {
  await this.adminService.collectAdminMetricsSnapshot();
  return { success: true };
}
```

- **Метод**: `POST`
- **URL**: `/admin/metrics/recalculate`
- **Авторизація**: JWT + `RoleGuard`, роль `ADMIN`.
- **Призначення**: разово запустити перерахунок тижневих метрик (якщо треба «прямо зараз» оновити дашборд).

---

### Формат запиту

- **Метод**: `GET`
- **URL**: `/admin/metrics/overview`
- **Авторизація**: JWT + `RoleGuard`, роль `ADMIN`.

**Query‑параметри:** **відсутні**  
Ендпоінт завжди повертає **останній доступний тижневий snapshot** (за останні 7 днів).

---

### Формат відповіді

**HTTP 200 OK**

```json
{
  "from": "2025-11-26T10:00:00.000Z",
  "to": "2025-12-03T10:00:00.000Z",
  "newUsers": 123,
  "totalUsers": 4567,
  "newPosts": 789,
  "newImagePosts": 650,
  "newVideoPosts": 139,
  "totalPosts": 3400,
  "totalImagePosts": 2800,
  "totalVideoPosts": 600,
  "activeUsers": 95,
  "newLikes": 2100,
  "totalLikes": 52000,
  "newContestPosts": 120,
  "newRegularPosts": 669,
  "avgLikesPerPost": 2.66,
  "aiStats": {
    "image": {
      "flux": { "newPosts": 400, "totalPosts": 0 },
      "aura_flow": { "newPosts": 150, "totalPosts": 0 }
    },
    "video": {
      "byty_dance": { "newPosts": 20, "totalPosts": 0 }
    }
  }
}
```

**Поля:**

- **from** – початок тижневого періоду (`periodStart`, 7 днів тому від моменту snapshot’а).
- **to** – кінець тижневого періоду (`periodEnd`, час створення snapshot’а).
- **newUsers** – скільки нових користувачів зареєструвалися за останні 7 днів.
- **totalUsers** – загальна кількість користувачів на момент `to`.
- **newPosts** – скільки нових постів створено за останні 7 днів.
- **newImagePosts** – скільки нових image‑постів створено за останні 7 днів.
- **newVideoPosts** – скільки нових video‑постів створено за останні 7 днів.
- **totalPosts** – загальна кількість постів на момент `to`.
- **totalImagePosts** – загальна кількість image‑постів на момент `to`.
- **totalVideoPosts** – загальна кількість video‑постів на момент `to`.
- **activeUsers** – скільки унікальних користувачів створювали пости за останні 7 днів.
- **newLikes** – скільки лайків поставлено за останні 7 днів.
- **totalLikes** – загальна кількість лайків на момент `to`.
- **newContestPosts** – скільки нових постів за тиждень було створено в рамках конкурсів.
- **newRegularPosts** – скільки нових постів за тиждень було створено поза конкурсами.
- **avgLikesPerPost** – середня кількість лайків на новий пост за тиждень (`newLikes / newPosts`, округлена до 2 знаків після коми).
- **aiStats.image** – по кожному AI‑сервісу для image‑генерації: скільки нових постів було створено за тиждень (`newPosts`).  
  **Примітка**: Пости без вказаного `ai_service` в `generation_params` (legacy пости) автоматично зараховуються до `"flux"`.
- **aiStats.video** – по кожному AI‑сервісу для video‑генерації: скільки нових відео‑постів було створено за тиждень (`newPosts`).  
  **Примітка**: Відео‑пости без вказаного `ai_service` автоматично зараховуються до `"byty_dance"`.

Якщо ще не створено жодного snapshot’а, всі числові значення повертаються як `0`, а `from` / `to` будуть `null`.

---

### Обмеження та зауваження

- Точність метрик залежить від **частоти крону** і того, наскільки стабільно він відпрацьовує (якщо крон зупинений надовго, будуть «дірки» в даних).
- Зараз період фіксований (7 днів). Якщо в майбутньому будуть потрібні інші вікна (1 день, 30 днів), можна:
  - або завести окремі таблиці / snapshot-и,
  - або додати окремі крон‑джоби для різних періодів.
- При потребі можна розширити метрики:
  - додати стовпці для генерацій по AI‑сервісах (image/video);
  - рахувати DAU/WAU/MAU більш точно (через активності, а не тільки пости).

