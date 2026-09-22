# SucharAI
SucharAI is an AI-powered personal assistant built with Python, AI/ML, and Firebase, featuring voice and text interaction, offline capabilities, task automation, and intelligent contextual assistance across desktop and mobile platforms.

## Project Structure

- `frontend/` contains the React single-page application and Vite configuration.
- `backend/` contains the Express API, database helpers, extraction, and RAG services.
- `data/` contains the local JSON database used by the backend.
- `test/` contains backend regression tests.

# 🤖 SucharAI

> An intelligent, privacy-focused AI assistant that works through voice and text, helping users automate daily tasks, answer questions, and interact naturally—online or offline.

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![AI](https://img.shields.io/badge/AI-Machine%20Learning-green)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Status](https://img.shields.io/badge/Status-Under%20Development-orange)

---

# 📖 Overview

SucharAI is an open-source AI-powered personal assistant designed for desktop and mobile platforms. It combines Artificial Intelligence, Machine Learning, Computer Vision, Natural Language Processing, and Voice Recognition to provide a smart assistant capable of understanding user commands and performing tasks efficiently.

Unlike traditional assistants, SucharAI is designed with both online and offline capabilities. It can continue assisting users even when internet connectivity is unavailable by utilizing local AI models and stored knowledge.

The project focuses on creating an assistant that is:

- Intelligent
- Fast
- Secure
- Privacy-focused
- Cross-platform
- Extensible

---

# ✨ Features

## 💬 AI Chat

- Natural language conversations
- Context-aware responses
- Memory support
- Multi-turn conversations
- Smart suggestions

---

## 🎙 Voice Assistant

- Wake word detection
- Speech-to-text
- Text-to-speech
- Voice commands
- Continuous listening mode

---

## 🧠 AI & Machine Learning

- Natural Language Processing (NLP)
- Local AI inference
- LLM integration
- Intelligent decision making
- Context understanding

---

## 💻 Desktop Assistant

- Open applications
- Search files
- Launch websites
- Execute custom commands
- System information
- Notifications

---

## 📱 Mobile Companion

- Synchronize conversations
- Notifications
- Voice interaction
- Cloud backup
- Remote assistant control

---

## 🌐 Online Mode

- Internet search
- Weather
- News
- Email support
- Calendar integration
- AI APIs
- Firebase synchronization

---

## 📴 Offline Mode

- Offline chatbot
- Local database
- Local AI models
- Cached knowledge
- Offline voice recognition
- Offline task execution

---

## ☁ Firebase Integration

- Authentication
- Cloud Firestore
- Realtime Database
- Cloud Storage
- User profiles
- Chat history
- Settings synchronization

---

## 🔐 Security

- Secure authentication
- Local data encryption
- User privacy
- Permission management
- Secure cloud synchronization

---

## 🤖 Automation

- Daily reminders
- Notes
- Task scheduling
- File management
- Workflow automation
- Custom actions

---

## 👁 Computer Vision (Future)

- Face recognition
- Face emotion detection
- Object detection
- OCR
- Gesture recognition
- Camera integration

---

# 🛠 Technology Stack

## Languages

- Python
- JavaScript
- TypeScript
- Java
- Dart

## AI & ML

- TensorFlow
- PyTorch
- OpenCV
- Transformers
- Scikit-learn
- NumPy
- Pandas

## Backend

- FastAPI
- Flask
- Node.js

## Frontend

- React
- Next.js
- Flutter
- Tailwind CSS

## Database

- Firebase
- Firestore
- MongoDB
- SQLite

## Tools

- Git
- GitHub
- VS Code
- Android Studio
- Docker

---

# 📂 Project Structure

```
SucharAI/
│
├── assistant/
├── ai/
├── models/
├── voice/
├── vision/
├── backend/
├── frontend/
├── mobile/
├── database/
├── firebase/
├── api/
├── config/
├── frontend/src/assets/
├── docs/
├── tests/
├── scripts/
├── requirements.txt
├── README.md
└── LICENSE
```

---

# 🚀 Installation

## Clone Repository

```bash
git clone https://github.com/yourusername/SucharAI.git
```

```bash
cd SucharAI
```

---

## Create Virtual Environment

Windows

```bash
python -m venv venv
venv\Scripts\activate
```

Linux / macOS

```bash
python3 -m venv venv
source venv/bin/activate
```

---

## Install Dependencies

```bash
pip install -r requirements.txt
```

---

## Run

```bash
python main.py
```

---

# 🎯 Roadmap

### Phase 1

- AI Chat
- Voice Assistant
- Firebase Authentication
- Local Database
- Desktop Application

### Phase 2

- Mobile App
- Offline AI
- Local LLM
- Automation Engine

### Phase 3

- Face Recognition
- Emotion Detection
- Smart Camera
- Gesture Control

### Phase 4

- IoT Integration
- Smart Home Control
- Multi-device Synchronization
- AI Plugins

---

# 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a new feature branch
3. Commit your changes
4. Push to your branch
5. Open a Pull Request

---

# 📜 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

**Sujan Chandra Ray**

AI/ML Engineer • Full-Stack Developer • Web Designer

- Python
- Artificial Intelligence
- Machine Learning
- Computer Vision
- React
- Flutter
- Firebase
- Node.js
- MongoDB

---

# ⭐ Support

If you find this project useful:

⭐ Star this repository

🍴 Fork the repository

💡 Share your ideas

🤝 Contribute to development

---

# 🌟 Vision

**SucharAI aims to become an intelligent, secure, and privacy-first AI assistant that seamlessly supports users across desktop, mobile, and future smart devices—making everyday tasks simpler through natural voice and text interactions.**

---

## 📱 Mobile build — API host configuration

Mobile apps (APK) run inside a native WebView and cannot reliably use `localhost` to reach your development server. Configure the mobile app to point to a reachable API host before building the APK.

- Create a copy of `.env.example` and set `VITE_MOBILE_API_BASE_URL` to your machine's LAN IP (for example `http://192.168.1.100:3000`) or a public HTTPS tunnel (ngrok).
- Example file: [`.env.example`](.env.example)

PowerShell (temporary build):
```powershell
$env:VITE_MOBILE_API_BASE_URL="http://192.168.1.100:3000"
npm run build
npx cap copy android
npx cap open android
```

Bash (temporary build):
```bash
VITE_MOBILE_API_BASE_URL="http://192.168.1.100:3000" npm run build
npx cap copy android && npx cap open android
```

Using ngrok (no LAN required):
```bash
npx ngrok http 3000
# use the generated https://... URL as VITE_MOBILE_API_BASE_URL (HTTPS avoids cleartext issues)
```

Notes:
- On Android emulators use `http://10.0.2.2:3000` (the app now falls back to that when running under `capacitor://`/`file://` origins).
- For physical devices, the app must be able to reach your machine IP; disable or configure firewalls accordingly.
- If you use an HTTP (non-HTTPS) API host, the manifest enables cleartext for debug builds; for production prefer HTTPS.
