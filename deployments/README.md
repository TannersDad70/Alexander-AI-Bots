# Deployment

`alexander/branded/index.html` is the page shell the Alexander deployment
serves. The artwork beside it comes from `../branding/assets/`.

Changes here are published when **Update the app** is pressed on the
deployment: the update service runs `services/deploy-from-repo.sh` from this
repository's clone, which copies the shell into the deployment's `branded/`
directory and the artwork beside it. Nothing is restarted — the shell and the
artwork are files the web server reads on every request.

The signed-in user area (`branded/user-menu.css` and `user-menu.js` on the
deployment) is live-only: publishing never overwrites it.
