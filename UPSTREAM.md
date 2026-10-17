# Upstream versions / attribution

This deployment uses the official **kittors/CliRelay** Go gateway Docker image and its independently maintained **kittors/codeProxy** panel served at `/manage`.

Verified upstream main commits on 2026-10-17:

- CliRelay: `11d8df955fafc72303c6e1b29fe1e648908fe6de`
- codeProxy: `138facd52dda51530c99e6ef48a116a76cf1cd20`

The Docker Compose default tag (`ghcr.io/kittors/clirelay:latest`) is mutable and **not guaranteed to match those commits**. Pin the image by digest when deploying commercially. Tests cover the Node reverse proxy only; they do not substitute for end-to-end validation against an actual CliRelay image.

License note: CliRelay MIT; codeProxy README states no license published for frontend. No codeProxy frontend code is copied or licensed by AethinkAI. A separate permission from the frontend owner is necessary before redistributing a modified frontend for commercial use.

Upstream source: https://github.com/kittors/CliRelay
Upstream frontend: https://github.com/kittors/codeProxy
