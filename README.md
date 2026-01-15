# 📧 Email Verifier

A bulk email verification tool that validates email addresses and filters out invalid, disposable, and risky emails. Built with Next.js and deployed on Vercel.

**Live Demo:** [https://email-verifier-lake.vercel.app](https://email-verifier-lake.vercel.app)

![Email Verifier Screenshot](https://img.shields.io/badge/Status-Live-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black)

---

## 🎯 Why Email Verification Matters

Emails are the most reliable way to contact clients. They're used everywhere — sign ups, registrations, comments, subscriptions. But besides legitimate visitors, emails can be used by spammers with both real and fake addresses.

**Problems with unverified email lists:**
- 📛 **Block Lists** - Sending to non-existent emails can get your IP blacklisted
- 📉 **Low Delivery Rate** - Emails bounce, hurting sender reputation
- 📁 **Spam Folders** - Your legitimate emails may be flagged as spam
- 💸 **Wasted Money** - Sending to fake/disposable emails wastes resources

> According to industry statistics, about **30% of email addresses** used to spam websites are fake.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📝 **Syntax Validation** | RFC-compliant email format checking |
| 🌐 **MX Record Lookup** | Verifies domain has mail servers via DNS |
| 🗑️ **Disposable Detection** | Flags 500+ temporary email services |
| 👤 **Role-based Detection** | Identifies generic emails (info@, support@, admin@) |
| ✏️ **Typo Detection** | Catches common domain typos (gmial.com → gmail.com) |
| 📊 **Bulk Processing** | Handle thousands of emails with progress tracking |
| 📥 **CSV Export** | Download results with status columns |

---

## 🚀 How It Works

### Verification Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │────▶│   Parse     │────▶│  Validate   │
│    CSV      │     │   Emails    │     │   Batch     │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │   Syntax    │           │     MX      │           │ Disposable  │
             │   Check     │           │   Lookup    │           │   Check     │
             └─────────────┘           └─────────────┘           └─────────────┘
                    │                          │                          │
                    └──────────────────────────┼──────────────────────────┘
                                               ▼
                                      ┌─────────────┐
                                      │   Results   │
                                      │  valid/     │
                                      │  invalid/   │
                                      │  risky      │
                                      └─────────────┘
```

### Email Status Categories

| Status | Meaning | Action |
|--------|---------|--------|
| ✅ `valid` | All checks passed | Safe to email |
| ❌ `invalid` | Failed critical check | Remove from list |
| ⚠️ `risky` | Passed but flagged | Review manually |

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** CSS-in-JS (inline styles)
- **CSV Parsing:** PapaParse
- **DNS Lookup:** Google DNS-over-HTTPS API
- **Deployment:** Vercel (Edge Runtime)

---

## 📁 Project Structure

```
email-verifier/
├── app/
│   ├── api/
│   │   └── verify/
│   │       └── route.ts      # API endpoint for email verification
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main UI component
├── lib/
│   ├── disposable-domains.ts # 500+ disposable email domains
│   └── email-validator.ts    # Core validation logic
├── package.json
├── tsconfig.json
└── next.config.js
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/anthropics/email-verifier.git
cd email-verifier

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo to Vercel for automatic deployments.

---

## 📖 Usage

### Web Interface

1. **Upload CSV** - Drag & drop or click to browse
2. **Select Column** - Choose which column contains emails
3. **Verify** - Click "Start Verification"
4. **Download** - Export results as CSV

### API Endpoint

```bash
POST /api/verify
Content-Type: application/json

{
  "emails": [
    "test@gmail.com",
    "fake@tempmail.com",
    "invalid-email"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 3,
    "valid": 1,
    "invalid": 2,
    "risky": 0
  },
  "results": [
    {
      "email": "test@gmail.com",
      "status": "valid",
      "reason": "All checks passed"
    },
    {
      "email": "fake@tempmail.com",
      "status": "invalid",
      "reason": "Disposable/temporary email address"
    },
    {
      "email": "invalid-email",
      "status": "invalid",
      "reason": "Missing @ symbol"
    }
  ]
}
```

---

## 🔍 Validation Checks Explained

### 1. Syntax Validation
- Valid email format (RFC 5322)
- Proper @ symbol placement
- Valid domain structure
- TLD exists and is valid

### 2. MX Record Lookup
- Uses Google's DNS-over-HTTPS API
- Verifies domain has mail servers
- Falls back to A record check

### 3. Disposable Email Detection
- Database of 500+ known disposable domains
- Includes: tempmail, guerrillamail, mailinator, yopmail, etc.

### 4. Role-based Detection
- Flags generic/department emails
- Examples: info@, support@, admin@, sales@, noreply@

### 5. Typo Detection
- Common misspellings of popular domains
- Provides correction suggestions
- Examples: gmial.com → gmail.com

---

## ⚠️ Limitations

This tool performs **Syntax + MX + Pattern** verification, which catches ~70-80% of invalid emails.

**What it catches:**
- ✅ Invalid syntax
- ✅ Non-existent domains
- ✅ Domains without mail servers
- ✅ Disposable/temporary emails
- ✅ Common typos

**What it cannot catch:**
- ❌ Valid domain but non-existent mailbox (e.g., `nonexistent@gmail.com`)

For 100% mailbox verification, SMTP verification would be required (not possible on serverless platforms due to port 25 restrictions).

---

## 📊 Performance

| Emails | Estimated Time |
|--------|---------------|
| 1,000 | ~30 seconds |
| 10,000 | ~3 minutes |
| 50,000 | ~15 minutes |
| 100,000 | ~30 minutes |

*Times may vary based on network conditions and DNS response times.*

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

- [Google Public DNS](https://dns.google/) for DNS-over-HTTPS API
- [PapaParse](https://www.papaparse.com/) for CSV parsing
- Disposable email domain lists from the community

---

**Built with ❤️ for cleaner email lists**
