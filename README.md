# AI Ticket Assistant

An AI-powered ticket management system that automatically analyzes support tickets, determines priority and required skills, assigns tickets to the best available moderator, and sends notifications through background workflows.

## 🚀 Live Demo

- **Frontend:** https://aiticketgenerator.vercel.app
- **Backend API:** https://ai-ticket-assistant-api.onrender.com
- **Inngest:** Background event-driven workflows
- **MongoDB:** Persistent application data
- **Gemini:** AI-powered ticket analysis
- **Mailtrap:** Email testing and delivery sandbox

## ✨ Features

### AI Ticket Analysis
When a ticket is created, Gemini analyzes the ticket and generates:

- Priority
- Required technical skills
- Helpful notes for the moderator
- Ticket classification metadata

### Intelligent Moderator Assignment
Tickets are assigned based on skill matching rather than random assignment.

For example:

- Python + Machine Learning ticket → Python/ML moderator
- React + JavaScript ticket → React/JavaScript moderator
- No suitable moderator → deterministic admin fallback

### Event-Driven Background Processing
The application uses Inngest to handle background workflows so users receive an immediate response while AI processing and emails run asynchronously.

Main workflows include:

- User signup → confirmation email
- Ticket creation → AI analysis → moderator assignment
- Ticket assignment → assignment email

### Role-Based Access Control

The application supports three roles:

- **User** — Create and view their own tickets
- **Moderator** — View assigned tickets and update their lifecycle
- **Admin** — Manage users, skills, roles, and all tickets

### Ticket Lifecycle

Tickets follow a controlled lifecycle:

`TODO → IN_PROGRESS → DONE`

- New tickets start as `TODO`
- Successful AI processing and assignment moves them to `IN_PROGRESS`
- Assigned moderators can complete tickets as `DONE`
- `DONE` tickets are terminal and cannot be reopened through the normal workflow

### Production-Ready Architecture

- React + Vite frontend
- Node.js + Express backend
- MongoDB with Mongoose
- Gemini API
- Inngest background workflows
- JWT authentication
- Nodemailer + Mailtrap
- Vercel frontend deployment
- Render backend deployment

## 🏗️ Project Structure

```text
ai_ticket_generator/
├── ai-ticket-assistant/       # Express backend
│   ├── controllers/
│   ├── inngest/
│   │   └── functions/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── tests/
│   ├── utils/
│   ├── scripts/
│   ├── .env.example
│   └── index.js
│
├── ai-ticket-frontend/        # React + Vite frontend
│   ├── src/
│   ├── public/
│   └── .env.example
│
├── render.yaml
├── .gitignore
└── README.md
```

## 🔄 Application Workflow

```text
User creates ticket
        │
        ▼
Ticket saved as TODO
        │
        ▼
Inngest: ticket/created
        │
        ▼
Gemini analyzes ticket
        │
        ├── Priority
        ├── Required skills
        └── Helpful notes
        │
        ▼
Best moderator selected by skills
        │
        ▼
Ticket → IN_PROGRESS
        │
        ▼
Inngest: ticket/assigned
        │
        ▼
Assignment email sent
        │
        ▼
Moderator works on ticket
        │
        ▼
Ticket → DONE
```

## 🖼️ Screenshots

### Login & User Workspace

![Login and user ticket workspace](./docs/screenshots/auth-and-user.jpg)

### Admin Ticket Operations

![Admin ticket operations](./docs/screenshots/admin-tickets.jpg)

### Admin User Management

![Admin user management and skill editing](./docs/screenshots/admin-users.jpg)

## 🛠️ Tech Stack

### Frontend
- React.js
- Vite
- JavaScript
- CSS

### Backend
- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT
- Nodemailer

### AI & Automation
- Google Gemini API
- Inngest
- Event-driven background processing

### Deployment
- Vercel
- Render
- MongoDB
- Mailtrap

## ⚙️ Environment Variables

### Backend

Create `ai-ticket-assistant/.env` locally using `.env.example`.

Required variables:

```env
MONGO_URI=
JWT_SECRET=
GEMINI_API_KEY=
GEMINI_MODEL=
MAILTRAP_SMTP_HOST=
MAILTRAP_SMTP_PORT=
MAILTRAP_SMTP_USER=
MAILTRAP_SMTP_PASS=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
FRONTEND_URL=
CORS_ORIGIN=
```

For production, these values should be configured through the hosting provider's environment-variable settings.

**Never commit real API keys, passwords, database credentials, JWT secrets, or Inngest keys to GitHub.**

### Frontend

Create `ai-ticket-frontend/.env`:

```env
VITE_SERVER_URL=
```

## 💻 Local Development

### 1. Clone the repository

```bash
git clone https://github.com/ranjanabhijeet/ai_ticket_generator.git
cd ai_ticket_generator
```

### 2. Start the backend

```bash
cd ai-ticket-assistant
npm install
npm run dev
```

The backend runs locally on port `3000`.

### 3. Start Inngest locally

In another terminal:

```bash
cd ai-ticket-assistant
npm run inngest-dev
```

### 4. Start the frontend

In another terminal:

```bash
cd ai-ticket-frontend
npm install
npm run dev
```

The Vite development server will provide the local frontend URL.

## 🧪 Testing

The backend includes focused tests for:

- AI ticket analysis
- Moderator skill assignment
- Ticket lifecycle
- User and role management
- Email workflows
- End-to-end integration workflow

Available test commands can be found in `ai-ticket-assistant/package.json`.

## 🔐 Security

- Secrets are supplied through environment variables.
- Production credentials are not stored in the repository.
- JWT is used for authentication.
- Role-based authorization protects administrative and moderator actions.
- User responses do not expose passwords.
- Production storage requires MongoDB rather than silently falling back to demo storage.
- CORS is restricted to configured frontend origins.

## 📌 Production Workflow

The deployed system has been tested end-to-end:

```text
Vercel
  ↓
Render API
  ↓
MongoDB
  ↓
Inngest
  ↓
Gemini AI
  ↓
Skill-based moderator assignment
  ↓
Mailtrap email notification
```

## 👨‍💻 Author

**Abhijeet Ranjan**

- GitHub: https://github.com/ranjanabhijeet
- LinkedIn: https://www.linkedin.com/in/abhijeet-ranjan-439207266/

## 📄 License

This project is available for educational and portfolio purposes.
