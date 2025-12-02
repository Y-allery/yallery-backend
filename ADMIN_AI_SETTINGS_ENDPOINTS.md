# Admin AI Settings Endpoints Documentation

## Overview
These endpoints allow administrators to retrieve and manage AI model settings for both image and video generation.

---

## GET /admin/ai-settings

### Description
Retrieves all AI model settings organized by type (image, video, and combined). Returns complete information about all AI models including their configuration, pricing, capabilities, and status.

### Authentication
- **Required**: Yes
- **Role**: ADMIN only
- **Guard**: JwtAuthGuard + RoleGuard

### Request
- **Method**: GET
- **Path**: `/admin/ai-settings`
- **Headers**: 
  - `Authorization: Bearer <JWT_TOKEN>`

### Response

#### Success (200 OK)
```json
{
  "image": [
    {
      "id": 1,
      "ai_service": "aura_flow",
      "name": "Ideogram",
      "allowedOrientations": ["horizontal", "vertical"],
      "minImages": 1,
      "maxImages": 5,
      "maxPromptLength": 1000,
      "sizes": ["1024x1024", "1536x640", "768x1344"],
      "qualityOptions": null,
      "styles": null,
      "cost": 20,
      "api_model": "fal-ai/ideogram/v2",
      "description": "Specializes in soft, atmospheric, dream-like imagery...",
      "type": "image",
      "is_artem": false,
      "is_active": true,
      "createdAt": "2025-12-02T18:12:12.089Z",
      "updatedAt": "2025-12-02T18:12:12.089Z"
    },
    // ... more image models
  ],
  "video": [
    {
      "id": 7,
      "ai_service": "byty_dance",
      "name": "Byty Dance",
      "allowedOrientations": [],
      "minImages": 1,
      "maxImages": 1,
      "maxPromptLength": 1000,
      "sizes": null,
      "qualityOptions": null,
      "styles": null,
      "cost": 100,
      "api_model": "fal-ai/bytedance/seedance/v1/lite/image-to-video",
      "description": "Create animated videos from your image with BytyDance.",
      "type": "video",
      "is_artem": false,
      "is_active": true,
      "createdAt": "2025-12-02T18:12:12.089Z",
      "updatedAt": "2025-12-02T18:12:12.089Z"
    }
  ],
  "all": [
    // All models (image + video) combined
  ]
}
```

#### Response Fields

**image** (array)
- All AI models configured for image generation
- Sorted by ID in ascending order

**video** (array)
- All AI models configured for video generation
- Sorted by ID in ascending order

**all** (array)
- Combined list of all AI models (image + video)
- Sorted by ID in ascending order

**Model Object Fields:**
- `id` (number): Unique identifier (read-only)
- `ai_service` (string): Service identifier (e.g., 'flux', 'aura_flow', 'byty_dance')
- `name` (string): Display name of the AI model
- `allowedOrientations` (string[]): Supported orientations ['horizontal', 'vertical']
- `minImages` (number): Minimum number of images/videos that can be generated
- `maxImages` (number): Maximum number of images/videos that can be generated
- `maxPromptLength` (number): Maximum prompt length in characters
- `sizes` (string[] | null): Available image sizes (e.g., ['1024x1024', '1536x640'])
- `qualityOptions` (string[] | null): Available quality options
- `styles` (string[] | null): Available style options
- `cost` (number): Cost per image/video in credits
- `api_model` (string | null): API model identifier (e.g., 'fal-ai/flux-pro/v1.1-ultra')
- `description` (string | null): Description of the AI model
- `type` ('image' | 'video'): Type of AI model
- `is_artem` (boolean): Whether this is an Artem model
- `is_active` (boolean): Whether the model is currently active
- `createdAt` (string): Creation timestamp
- `updatedAt` (string): Last update timestamp

---

## PUT /admin/ai-settings/:id

### Description
Updates AI model settings. All fields except `id` are optional and can be edited. Only provided fields will be updated (partial update). Validates that `ai_service` is unique if being changed.

### Authentication
- **Required**: Yes
- **Role**: ADMIN only
- **Guard**: JwtAuthGuard + RoleGuard

### Request
- **Method**: PUT
- **Path**: `/admin/ai-settings/:id`
- **Headers**: 
  - `Authorization: Bearer <JWT_TOKEN>`
  - `Content-Type: application/json`

### Path Parameters
- `id` (number, required): The ID of the AI settings to update

### Request Body
All fields are optional. Only include fields you want to update.

```json
{
  "name": "FLUX AI Pro",
  "allowedOrientations": ["horizontal", "vertical"],
  "minImages": 1,
  "maxImages": 10,
  "maxPromptLength": 2000,
  "sizes": ["1024x1024", "1536x640", "768x1344", "2048x2048"],
  "qualityOptions": ["standard", "high", "ultra"],
  "styles": ["realistic", "artistic", "abstract"],
  "cost": 35,
  "api_model": "fal-ai/flux-pro/v1.2-ultra",
  "description": "Updated description of the model",
  "type": "image",
  "is_artem": false,
  "is_active": true
}
```

### Request Body Fields

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `ai_service` | string | No | Service identifier | Must be unique if provided |
| `name` | string | No | Display name | - |
| `allowedOrientations` | string[] | No | Supported orientations | Array of strings |
| `minImages` | number | No | Minimum images | Positive integer |
| `maxImages` | number | No | Maximum images | Positive integer, >= minImages |
| `maxPromptLength` | number | No | Max prompt length | Positive integer |
| `sizes` | string[] \| null | No | Available sizes | Array of strings or null |
| `qualityOptions` | string[] \| null | No | Quality options | Array of strings or null |
| `styles` | string[] \| null | No | Style options | Array of strings or null |
| `cost` | number | No | Cost per image/video | Positive integer |
| `api_model` | string \| null | No | API model identifier | String or null |
| `description` | string \| null | No | Model description | String or null |
| `type` | 'image' \| 'video' | No | Model type | Enum: 'image' or 'video' |
| `is_artem` | boolean | No | Artem model flag | Boolean |
| `is_active` | boolean | No | Active status | Boolean |

**Note**: The `id` field cannot be updated and will be ignored if provided.

### Response

#### Success (200 OK)
Returns the updated AI settings object:
```json
{
  "id": 2,
  "ai_service": "flux",
  "name": "FLUX AI Pro",
  "allowedOrientations": ["horizontal", "vertical"],
  "minImages": 1,
  "maxImages": 10,
  "maxPromptLength": 2000,
  "sizes": ["1024x1024", "1536x640", "768x1344", "2048x2048"],
  "qualityOptions": ["standard", "high", "ultra"],
  "styles": ["realistic", "artistic", "abstract"],
  "cost": 35,
  "api_model": "fal-ai/flux-pro/v1.2-ultra",
  "description": "Updated description of the model",
  "type": "image",
  "is_artem": false,
  "is_active": true,
  "createdAt": "2025-12-02T18:12:12.246Z",
  "updatedAt": "2025-12-02T20:30:45.123Z"
}
```

#### Error Responses

**404 Not Found**
```json
{
  "statusCode": 404,
  "message": "AI settings with ID 999 not found",
  "error": "Not Found"
}
```

**400 Bad Request** (Validation error or duplicate ai_service)
```json
{
  "statusCode": 400,
  "message": "AI service 'flux' already exists",
  "error": "Bad Request"
}
```

**401 Unauthorized**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**403 Forbidden** (Not an admin)
```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

---

## Usage Examples

### Example 1: Get All AI Settings
```bash
curl -X GET "https://api.example.com/admin/ai-settings" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Example 2: Update AI Model Cost
```bash
curl -X PUT "https://api.example.com/admin/ai-settings/2" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cost": 40
  }'
```

### Example 3: Update Multiple Fields
```bash
curl -X PUT "https://api.example.com/admin/ai-settings/2" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "FLUX AI Ultra",
    "cost": 50,
    "maxImages": 8,
    "description": "Premium FLUX model with enhanced capabilities",
    "is_active": true
  }'
```

### Example 4: Deactivate a Model
```bash
curl -X PUT "https://api.example.com/admin/ai-settings/3" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_active": false
  }'
```

---

## Notes

1. **Partial Updates**: Only fields provided in the request body will be updated. Other fields remain unchanged.

2. **ID Field**: The `id` field is read-only and cannot be modified. It will be ignored if included in the update request.

3. **ai_service Uniqueness**: If you attempt to change `ai_service` to a value that already exists for another model, the request will fail with a 400 error.

4. **Type Safety**: The `type` field must be either 'image' or 'video'. Changing the type of a model may affect its availability in different endpoints.

5. **Active Status**: Setting `is_active` to `false` will hide the model from public endpoints but it will still be visible in admin endpoints.

6. **Ordering**: Results in GET endpoint are sorted by ID in ascending order.

