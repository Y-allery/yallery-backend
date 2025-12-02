# Список ендпоінтів, де отримуються пости по тегах в фіді

## 1. GET /post/feed
**Контролер:** `src/post/post.controller.ts` (рядок 43)  
**Сервіс:** `src/post/post.service.ts` - метод `getPosts()` (рядок 72)  
**Опис:** Основний фід користувача. Фільтрує пости по тегах, на які підписаний користувач.  
**Фільтрація по тегах:** 
- Фільтрує пости, де `p.tagId IN (SELECT tagsId FROM users_tags_tags WHERE usersId = userId)`
- Тобто показує тільки пости з тегів, на які підписаний користувач
- Додатково фільтрує: `is_published = true`, `is_blocked = false`, виключає переглянуті пости

**Параметри:**
- `cursor` (опціонально) - курсор для пагінації
- `limit` (за замовчуванням 10) - кількість постів

---

## 2. GET /post/get-posts-by-tag
**Контролер:** `src/post/post.controller.ts` (рядок 56)  
**Сервіс:** `src/post/post.service.ts` - метод `findPostsByTag()` (рядок 120)  
**Опис:** Отримує пости по конкретному тегу.  
**Фільтрація по тегах:**
- Фільтрує пости, де `tag.id = tagId`
- Додатково фільтрує: `is_published = true`

**Параметри:**
- `tagId` (обов'язково) - ID тегу
- `page` (обов'язково) - номер сторінки
- `limit` (обов'язково) - кількість постів на сторінці

**Проблема:** Не фільтрує `is_blocked` та `is_rejected`

---

## 3. GET /contest/posts/:contestId
**Контролер:** `src/contest/contest.controller.ts` (рядок 48)  
**Сервіс:** `src/contest/contest.service.ts` - метод `getPostsByContest()` (рядок 187)  
**Опис:** Отримує пости по конкурсу. Пости мають теги, але фільтрація йде по `contestId`, а не по тегах.  
**Фільтрація по тегах:**
- Теги використовуються тільки для відображення (`LEFT JOIN tags t ON p.tagId = t.id`)
- Фільтрація йде по `p.contestId = contestId`
- Додатково фільтрує: `is_published = true`, `is_blocked = false`

**Параметри:**
- `contestId` (в URL) - ID конкурсу
- `page` (за замовчуванням 1) - номер сторінки
- `limit` (за замовчуванням 10) - кількість постів

**Проблема:** Не фільтрує `is_rejected`

---

## 4. GET /activity/popular-posts
**Контролер:** `src/activity/activity.controller.ts` (рядок 139)  
**Сервіс:** `src/activity/activity.service.ts` - метод `getPopularPosts()` (рядок 461)  
**Опис:** Отримує популярні пости (6 найпопулярніших). Пости мають теги, але не фільтрує по тегах користувача.  
**Фільтрація по тегах:**
- Теги використовуються тільки для відображення (`LEFT JOIN tags t ON p.tagId = t.id`)
- НЕ фільтрує по тегах користувача - показує всі популярні пости
- Додатково фільтрує: `is_published = true`, `is_blocked = false`, `is_rejected = false`

**Параметри:** Немає (використовує userId з токену)

---

## Підсумок

### Ендпоінти, які ФІЛЬТРУЮТЬ по тегах користувача:
1. ✅ **GET /post/feed** - фільтрує по тегах, на які підписаний користувач

### Ендпоінти, які отримують пости по КОНКРЕТНОМУ тегу:
2. ✅ **GET /post/get-posts-by-tag** - фільтрує по конкретному tagId

### Ендпоінти, які показують теги, але НЕ фільтрують по них:
3. ⚠️ **GET /contest/posts/:contestId** - показує теги, але фільтрує по contestId
4. ⚠️ **GET /activity/popular-posts** - показує теги, але не фільтрує по них

---

## Виявлені проблеми:

1. **GET /post/get-posts-by-tag:**
   - ❌ Не фільтрує `is_blocked = false`
   - ❌ Не фільтрує `is_rejected = false`

2. **GET /contest/posts/:contestId:**
   - ❌ Не фільтрує `is_rejected = false`

