# herdr-config

Personal Herdr app config (`~/.config/herdr-app`): own layouts, mods, keys, themes, backgrounds, settings.
Shipped layouts/mods and runtime state are ignored.

## Use on another machine

```sh
cd ~/.config/herdr-app
git init && git remote add origin git@github-perso:louis-relandeau/herdr-config.git
git fetch && git checkout -f -t origin/main
```
