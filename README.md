# The Bookshop

A server-rendered bookstore built with Express, EJS, and MongoDB. It includes a searchable catalog, customer accounts, a shopping cart, cash-on-delivery checkout, order history, admin catalog/order management, and a contact form.

## Requirements

- Node.js 18.18 or newer
- MongoDB running locally, or a MongoDB Atlas cluster

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `SESSION_SECRET` to a unique random value (at least 32 characters in production).
4. Choose the database:
   - **MongoDB Compass/local MongoDB:** leave `MONGODB_URI` empty or set it to `mongodb://127.0.0.1:27017/bookstore`. Start the local MongoDB server, then connect MongoDB Compass to `mongodb://127.0.0.1:27017`.
   - **MongoDB Atlas:** replace the example `MONGODB_URI` with the connection string from Atlas. Create a database user, allow the app's IP address in Network Access, and URL-encode special characters in the database password.
5. Set a private `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
6. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `CONTACT_EMAIL` to enable contact form email delivery. `CONTACT_EMAIL` is the inbox that receives messages; SMTP values belong to the sending mailbox. For Gmail, use an App Password, not the account password.
7. Start the app with `npm run dev` or `npm start`, then open `http://localhost:3000`.

The app stores books, accounts, orders, contact messages, and sessions in MongoDB. The catalog starts empty; sign in at `/admin/login` and use **Add a book** to populate it. Images are optional and uploaded images are limited to 5 MB (JPG, PNG, WEBP, or GIF).

## Available commands

- `npm run dev` — start with nodemon
- `npm start` — start the application
- `npm run check` — check JavaScript syntax

Customer passwords are hashed before storage. Checkout currently supports cash on delivery; card/UPI processing is not enabled.
