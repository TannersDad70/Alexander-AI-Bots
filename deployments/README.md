# Deployment

`alexander/branded/index.html` is the page shell the Alexander deployment
serves. The artwork beside it comes from `../branding/assets/`.

Changes here are published by the timer on the deployment host
(`services/deploy-from-repo.sh` in the working tree, `bin/deploy-from-repo.sh`
on the machine): it copies the shell into the deployment's `branded/` directory
and the artwork beside it. Nothing is restarted — the shell and the artwork are
files the web server reads on every request.

The machine's copy installs itself from this one on every run, so changing
`services/deploy-from-repo.sh` here is all it takes — the next tick runs the
new script.
