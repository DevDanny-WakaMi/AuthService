AuthService

A stripped-down NestJS authentication vertical slice, extracted from the WakaMi backend as a learning project.

Sign up with an email or phone, verify via OTP, receive access + refresh tokens, hit a protected endpoint. OTP delivery is stubbed to a console log for local testing.

Stack

- Framework: NestJS 11 (Express under the hood)

- Language: TypeScript

- ORM: Prisma 7 (Postgres adapter)

- Database: PostgreSQL 15 (via Docker Compose)

- Auth: JWT (access token) + hashed refresh tokens

- Validation: class-validator + class-transformer

- Docs: Swagger UI

Scope

This is a self-contained vertical slice, not production auth. It intentionally leaves out:

- Social sign-in (Google, Apple, Facebook)

- Profile completion flow

- Forgot / reset password

- Scheduled account deletion + restore

- Brute-force / rate-limit guards

- Notification delivery (SMS, email)

Kept endpoints:

| Method | Path                | Description                                       |

| ------ | ------------------- | ------------------------------------------------- |

| POST   | “/auth/sign-up”     | Register with email or phone. Sends OTP.          |

| POST   | “/auth/verify-otp”  | Verify OTP. Creates user on first call.           |

| POST   | “/auth/sign-in”     | Request a fresh OTP for an existing user.         |

| POST   | “/auth/refresh”     | Rotate access + refresh tokens.                   |

| POST   | “/auth/logout”      | Revoke a refresh token.                           |

| GET    | “/auth/me”          | Return the current user. Requires Bearer token.   |

Getting started

Prerequisites

- Node.js 20+

- Docker Desktop (for Postgres)

- npm

1. Clone and install

bash

git clone https://github.com/DevDanny-WakaMi/AuthService.git

cd AuthService

npm install

2. Start Postgres

bash

docker compose up -d

Postgres runs on “localhost:5432” with user “postgres”, password “password”, database “wakami”.

3. Create your “.env”

env

DATABASE_URL="postgresql://postgres:password@localhost:5432/wakami?schema=public"

JWT_SECRET="dev-secret-change-in-prod"

PORT=3000

4. Apply migrations

bash

npx prisma migrate dev

5. Run the server

bash

npm run start:dev

Swagger UI: http://localhost:3000/api

End-to-end flow

1. Sign up. “POST /auth/sign-up”

   json

   { "email": "test@example.com", "role": "REQUESTER" }

   

   Returns “{ "message": "OTP sent" }”. The OTP is printed to your terminal:

   

   [OTP] test@example.com -> 483102

   

2. Verify OTP. “POST /auth/verify-otp”

   json

   { "identifier": "test@example.com", "code": "483102" }

   

   Returns “accessToken”, “refreshToken”, and the created user.

3. Hit a protected endpoint. “GET /auth/me” with header:

   

   Authorization: Bearer <accessToken>

   

   Returns the current user.

4. Rotate tokens. “POST /auth/refresh”

   json

   { "refreshToken": "<refreshToken>" }

   

   Returns a new pair. The old refresh token is revoked.

5. Log out. “POST /auth/logout” with the current access token in the header, and the refresh token in the body.

   json

   { "refreshToken": "<refreshToken>" }

   

Project structure

src/

├── auth/

│   ├── dto/                    class-validator DTOs for each endpoint

│   ├── auth.controller.ts      HTTP layer

│   ├── auth.service.ts         business logic

│   ├── auth.module.ts          wires providers together

│   ├── jwt.strategy.ts         passport-jwt strategy, populates req.user

│   ├── jwt-auth.guard.ts       @UseGuards(JwtAuthGuard)

│   └── referral-code.util.ts   generates WKM-XXX-YYYYYY codes

├── prisma/

│   ├── prisma.module.ts

│   └── prisma.service.ts       Prisma client, connects on module init

├── app.module.ts

└── main.ts                     Swagger + Helmet + ValidationPipe setup

prisma/

├── schema.prisma               three models: User, Otp, RefreshToken

└── migrations/

How the auth model works

- Access tokens are JWTs signed with “JWT_SECRET”, 1 hour TTL, carry “{ sub, email, role }”.

- Refresh tokens are 32 raw random bytes, SHA-256 hashed before storage. The plaintext is returned once at sign-in and never again. Rotating a refresh token revokes the old one atomically.

- OTPs are 6-digit codes, 10 minute TTL, one-shot (marked “used: true” after verification).

- JwtStrategy re-fetches the user from the DB on every request, so revoked or updated users can't ride a still-valid token.

Scripts

| Command              | Purpose                              |

| -------------------- | ------------------------------------ |

| “npm run start:dev”  | Dev server with hot reload           |

| “npm run start:prod” | Production build (needs “npm run build” first) |

| “npm run build”      | Compile TypeScript to “dist/”        |

| “npm run test”       | Run Jest unit tests                  |

| “npm run lint”       | ESLint with auto-fix                 |