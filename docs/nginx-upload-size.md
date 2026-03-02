# Video upload: direct to Cloudinary from frontend

Video upload is **only** done from the browser directly to Cloudinary. There is no `POST /upload/video` on the API.

1. In [Cloudinary Dashboard](https://console.cloudinary.com/) → Settings → Upload → Add upload preset.
2. Create an **unsigned** preset, set **Resource type** to **Video**, optionally set **Folder** to `meme_reference_videos`. Save.
3. In your backend `.env` add:
   ```
   CLOUDINARY_VIDEO_UPLOAD_PRESET=your_preset_name
   ```
4. Restart the backend. The admin Meme Generator gets `GET /upload/cloudinary-params` (cloudName + uploadPreset) and uploads the file to `https://api.cloudinary.com/.../video/upload`.

Image (GIF) upload still goes through the API: `POST /upload/image` (limit 25MB). If you need a higher limit behind nginx, set `client_max_body_size` in your nginx config.
