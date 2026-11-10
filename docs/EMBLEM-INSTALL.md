# Installing the supplied Pale Horse emblem

The homepage is now prepared to show `public/palehorse-emblem.png` on the black header. This asset is deliberately not substituted with a generic horse logo.

To include the exact emblem provided by Pale Horse Barbell:
1. Save the original emblem PNG as `public/palehorse-emblem.png` in the working repository.
2. Run `git add public/palehorse-emblem.png && git commit -m "Add official Pale Horse Barbell emblem" && git push origin feature/pale-horse-foundation`.
3. Run `docker compose up -d --build` to rebuild the static React bundle.

Until the emblem is present, the homepage displays the Pale Horse Barbell text wordmark and hides the missing image. This avoids a broken-image icon.
