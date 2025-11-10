# Тестові дані для checkReferralStatus

## Partnerships та підв'язані користувачі

### Partnership 1: Nomisma
- **ID**: 15
- **Partner Name**: Nomisma
- **Referral Token**: `9bc25575-c21c-4635-8ac2-3d8cc22d1ec8`
- **Source**: web app

#### Користувачі з Twitter username (для тестування retweet):

1. **User ID**: 970
   - **Partner User ID**: `0x463D654a8Dd7d698429a29a6A1d6E8A016d3F178`
   - **Email**: vitaly@xoob.gg
   - **Twitter**: `@_VitarLaeda_`
   - **Test URL**: 
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x463D654a8Dd7d698429a29a6A1d6E8A016d3F178&flag=retweet
     ```

2. **User ID**: 972
   - **Partner User ID**: `huhihkhkjh`
   - **Email**: david@yallery.app
   - **Twitter**: `@y_allery`
   - **Test URL**:
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=huhihkhkjh&flag=retweet
     ```

3. **User ID**: 977
   - **Partner User ID**: `0x1839D904d2c2aA153545646D7ebeFb33eE0430B4`
   - **Email**: 7hedfvcxz11o@gmail.com
   - **Twitter**: `@Andris.g`
   - **Test URL**:
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x1839D904d2c2aA153545646D7ebeFb33eE0430B4&flag=retweet
     ```

4. **User ID**: 978
   - **Partner User ID**: `0x9D25d2854392aa90c9e0A012F83595FaB87f2136`
   - **Email**: aaby160404@gmail.com
   - **Twitter**: `@aabyboy93`
   - **Test URL**:
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x9D25d2854392aa90c9e0A012F83595FaB87f2136&flag=retweet
     ```

5. **User ID**: 980
   - **Partner User ID**: `0xA6346E9426Ea2a093AF0Bf5B119651DAbd536946`
   - **Email**: kchalatashvili@gmail.com
   - **Twitter**: `@kakha4444`
   - **Test URL**:
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0xA6346E9426Ea2a093AF0Bf5B119651DAbd536946&flag=retweet
     ```

6. **User ID**: 982
   - **Partner User ID**: `0xFb3DB93eFc3A1b8aC4F498f28156584bA100493b`
   - **Email**: quangthoi1190@gmail.com
   - **Twitter**: `@ZzThoiChuazZ`
   - **Test URL**:
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0xFb3DB93eFc3A1b8aC4F498f28156584bA100493b&flag=retweet
     ```

7. **User ID**: 984
   - **Partner User ID**: `0x77A862fA32996c42ec282fC413422B8a9FaDcaC1`
   - **Email**: xadro.lexa@gmail.com
   - **Twitter**: `@anzceel`
   - **Test URL**:
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x77A862fA32996c42ec282fC413422B8a9FaDcaC1&flag=retweet
     ```

8. **User ID**: 985
   - **Partner User ID**: `0x6276095FAEA15108740445ff277fdA8c304657F4`
   - **Email**: nikkyvn89@gmail.com
   - **Twitter**: `@nikky_vu`
   - **Test URL**:
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x6276095FAEA15108740445ff277fdA8c304657F4&flag=retweet
     ```

9. **User ID**: 983
   - **Partner User ID**: `0x3195c3F94154364E897711e501e104f40D8e23fb`
   - **Email**: gokhanatalay@gmail.com
   - **Twitter**: `@neqro_61`
   - **Test URL**:
     ```
     GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x3195c3F94154364E897711e501e104f40D8e23fb&flag=retweet
     ```

10. **User ID**: 986
    - **Partner User ID**: `0x1F09216FC2A05C4B17ab09128F184615b8e0C49a`
    - **Email**: sashkinsin@gmail.com
    - **Twitter**: `@GifGim`
    - **Test URL**:
      ```
      GET /partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x1F09216FC2A05C4B17ab09128F184615b8e0C49a&flag=retweet
      ```

---

### Partnership 2: Xoob
- **ID**: 7
- **Partner Name**: Xoob
- **Referral Token**: `a8acd385-5fd3-4531-a20b-d7a19b7b7185`
- **Source**: mini app

---

## Приклади curl команд для тестування

### Тест 1: Перевірка retweet для користувача з Twitter
```bash
curl -X GET "http://localhost:8000/partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x463D654a8Dd7d698429a29a6A1d6E8A016d3F178&flag=retweet" \
  -H "Content-Type: application/json"
```

### Тест 2: Перевірка retweet для @y_allery (David)
```bash
curl -X GET "http://localhost:8000/partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=huhihkhkjh&flag=retweet" \
  -H "Content-Type: application/json"
```

### Тест 3: Перевірка інших flags (registered, image_generated, posted_to_twitter)
```bash
# Перевірка registered
curl -X GET "http://localhost:8000/partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x463D654a8Dd7d698429a29a6A1d6E8A016d3F178&flag=registered" \
  -H "Content-Type: application/json"

# Перевірка image_generated
curl -X GET "http://localhost:8000/partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x463D654a8Dd7d698429a29a6A1d6E8A016d3F178&flag=image_generated" \
  -H "Content-Type: application/json"

# Перевірка posted_to_twitter
curl -X GET "http://localhost:8000/partner/referral-status?ref=9bc25575-c21c-4635-8ac2-3d8cc22d1ec8&puid=0x463D654a8Dd7d698429a29a6A1d6E8A016d3F178&flag=posted_to_twitter" \
  -H "Content-Type: application/json"
```

---

## Доступні flags для перевірки:

1. **retweet** - Перевіряє чи користувач згадав @yallery в своїх твітах (real-time через TweetScout API)
2. **registered** - Користувач зареєструвався через referral link
3. **image_generated** - Користувач згенерував зображення
4. **posted_to_twitter** - Користувач опублікував твіт

---

## Примітки:

- Ендпоінт `/partner/referral-status` є **публічним** (не потребує авторизації)
- Ендпоінт `/admin/referral-status` потребує JWT токен адміна
- Для retweet перевірки потрібен Twitter username у користувача
- Якщо retweet знайдено, результат кешується в БД для майбутніх перевірок

