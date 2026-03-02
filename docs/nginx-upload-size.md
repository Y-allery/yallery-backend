# Fix 413 Request Entity Too Large for video upload

If the API is behind nginx and you get **413 Request Entity Too Large** on `POST /upload/video`:

## Option A: Direct upload to Cloudinary (recommended)

The admin panel can upload videos **directly to Cloudinary** from the browser, so the file never goes through your API or nginx.

1. In [Cloudinary Dashboard](https://console.cloudinary.com/) → Settings → Upload → Add upload preset.
2. Create an **unsigned** preset, set **Resource type** to **Video**, optionally set **Folder** to `meme_reference_videos`. Save.
3. In your backend `.env` add:
   ```
   CLOUDINARY_VIDEO_UPLOAD_PRESET=your_preset_name
   ```
4. Restart the backend. The admin Meme Generator will then use direct Cloudinary upload for reference videos (no 413).

## Option B: Increase nginx limit

In your nginx server block (or `http` block), add:

```nginx
client_max_body_size 100M;
```

Then reload nginx: `nginx -s reload` or `systemctl reload nginx`.

The Nest app allows up to 100MB for video and 25MB for image (GIF) when using `POST /upload/video` or `/upload/image`.
