# Trip media upload optimization

The browser optimizer lives in `admin/trips/media-optimize.js`. It loads the vendored Mediabunny bundle only for video preparation. Media stays on the device until the chosen smaller file is uploaded to the authenticated trip endpoint.

Rebuild the pinned vendor bundle from this directory:

```text
npm ci --ignore-scripts
npm run build
```

Commit the lockfile, generated bundle, MPL-2.0 license, and source notice together. The website build copies `admin/` and does not publish this build directory or its dependencies.

Check browser behavior with a JPEG/PNG photo and an MP4 with sound: upload from Photos & memories, confirm the original/stored sizes, play the uploaded video, and check sound, duration, date, and traveler visibility. Test cancellation during preparation and a compact file that should not be inflated. Confirm unsupported encoders fail clearly without silently discarding sound. Source limits: 50 MB photos, 250 MB videos, five minutes per video. Storage limits: 6 MB photos and 20 MB videos. Existing stored media is unchanged.
