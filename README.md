# Firebase Hosting GitHub Action

This fork is highly specialized for [Yew](https://github.com/yewstack/yew).

## Differences to upstream

- Allows token based authentication (`firebaseToken`)
- Deploy target selection (`targets`)
- Running for a Pull Request outside of the `pull_request` event
- Specifying a custom path for comment URLs (`commentURLPath`)

## Usage

### Deploy to a new preview channel for every PR

Add a workflow (`.github/workflows/deploy-preview.yml`):

```yaml
name: Deploy to Preview Channel

on:
  pull_request:
    # Optionally configure to run only for specific files. For example:
    # paths:
    # - "website/**"

jobs:
  build_and_preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Add any build steps here. For example:
      # - run: npm ci && npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: "${{ secrets.GITHUB_TOKEN }}"
          firebaseServiceAccount: "${{ secrets.FIREBASE_SERVICE_ACCOUNT }}"
          expires: 30d
          projectId: your-Firebase-project-ID
```

### Deploy to your live channel on merge

Add a workflow (`.github/workflows/deploy-prod.yml`):

```yaml
name: Deploy to Live Channel

on:
  push:
    branches:
      - main
    # Optionally configure to run only for specific files. For example:
    # paths:
    # - "website/**"

jobs:
  deploy_live:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Add any build steps here. For example:
      # - run: npm ci && npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          firebaseServiceAccount: "${{ secrets.FIREBASE_SERVICE_ACCOUNT }}"
          projectId: your-Firebase-project-ID
          channelId: live
```

## Options

See [action.yml](action.yml) for all options.

### `firebaseServiceAccount` _{string}_ (required unless `firebaseToken` is given)

This is a service account JSON key.

It's important to store this token as an
[encrypted secret](https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets)
to prevent unintended access to your Firebase project. Set it in the "Secrets" area
of your repository settings and add it as `FIREBASE_SERVICE_ACCOUNT`:
`https://github.com/USERNAME/REPOSITORY/settings/secrets`.

### `firebaseToken` _{string}_ (required unless `firebaseServiceAccount` is given)

Firebase token. Can be acquired using the command `firebase login:ci`.

### `repoToken` _{string}_

Adding `repoToken: "${{secrets.GITHUB_TOKEN}}"` lets the action comment on PRs
with the preview URL for the associated preview channel. You don't need to set
this secret yourself - GitHub sets it automatically.

If you omit this option, you'll need to find the preview URL in the action's
build log.

### `firebaseToolsVersion` _{string}_

The version of firebase-tools to use. Defaults to `latest`.

### `disableComment` _{string}_

Set to `"true"` to disable auto-commenting with the preview channel URL on the pull request.

### `force` _{string}_

Set to `"true"` to use the `--force` flag with firebase deploy.

## Outputs

Values emitted by this action that can be consumed by other actions later in your workflow

### `urls`

The url(s) deployed to

### `expire_time`

The time the deployed preview urls expire

### `expire_time_formatted`

The time the deployed preview urls expire in UTC format

### `details_url`

A single URL that was deployed to
