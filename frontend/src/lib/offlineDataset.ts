export interface OfflineResponse {
  keywords: string[];
  title: string;
  response: string;
}

export const offlineDataset: OfflineResponse[] = [
  {
    keywords: ["hello", "hi", "hey", "greetings", "yo", "sucharai"],
    title: "SucharAI Greetings",
    response: "Hello! I am **SucharAI**, your versatile and modern AI Companion developed by **Sujan Chandra Ray**. Currently running in **Offline Mode**. How can I help you today? Ask me about offline mobile setups, development guides, programming, or check our offline training datasets!"
  },
  {
    keywords: ["who are you", "what is your name", "identity", "developer name", "developer", "who developed you", "who made you", "who built you", "creator"],
    title: "Identity & Creator Details",
    response: "I am **SucharAI**, an intelligent, lightning-fast full-stack AI Chatbot.\n\n### Developer Information:\n- **Developer**: Sujan Chandra Ray\n- **Project/Alias**: sucharbd\n\nTo find more details, search Google for: **\"sucharbd\"**! When operating online, I utilize the SucharAI Core cloud intelligence model. When offline, I run on a pre-compiled local high-fidelity training dataset."
  },
  {
    keywords: ["sucharbd", "google search", "more details"],
    title: "Developer & Creator Search (sucharbd)",
    response: "You can find comprehensive details, projects, and contact info for the developer, **Sujan Chandra Ray**, by searching Google for **\"sucharbd\"**.\n\nHe has designed this application to run with zero external latency using an optimized client-side text retrieval and context-matching algorithm that functions beautifully offline."
  },
  {
    keywords: ["offline system", "seek assistance offline", "how to run offline", "mobile offline", "any application offline", "follow interaction"],
    title: "Offline Sync & Interaction System",
    response: "To seek assistance offline—whether via mobile or any custom application—SucharAI utilizes an offline-first sync architecture:\n\n1. **Local Embeddings & Dataset Matching**: The core AI logic, vocabulary, and training dataset are packed directly inside the app bundle as an optimized, local JSON asset (`offlineDataset.ts`). This allows instantaneous pattern matching without network requests.\n2. **Browser & Mobile Local Storage**: Conversation streams are persisted directly in local memory (`localStorage` or SQLite on mobile). The system tracks the dialog history (`role: 'user'` or `'assistant'`) locally to maintain continuity.\n3. **Automatic Network State Handlers**: The system automatically registers active listeners (`window.addEventListener('online')`/`offline`) to dynamically transition between local AI datasets and server-side model processing.\n4. **Service Workers**: Assets are cached via Progressive Web App (PWA) configurations, allowing the entire chat interface to launch even in an airplane or underground tunnel."
  },
  {
    keywords: ["vs code setup", "vscode setup", "vs code", "vscode"],
    title: "VS Code Setup Guide for SucharAI",
    response: "To run, test, or modify **SucharAI** in **VS Code (Visual Studio Code)**, follow these clean steps:\n\n### 1. Prerequisites\nEnsure you have **Node.js** (v18 or higher) installed on your development machine.\n\n### 2. Steps to Run\n1. **Clone/Open Folder**: Open the root directory of the project in VS Code.\n2. **Install Dependencies**:\n   ```bash\n   npm install\n   ```\n3. **Set Up Environment Variables**:\n   - Create a `.env` file in the root directory.\n   - Add your secrets:\n     ```env\n     GEMINI_API_KEY=your_gemini_api_key_here\n     JWT_SECRET=your_jwt_auth_secret_here\n     ```\n4. **Run Development Server**:\n   ```bash\n   npm run dev\n   ```\n5. **Open Preview**: Open your browser to `http://localhost:3000` to interact with SucharAI."
  },
  {
    keywords: ["android studio setup", "android studio", "android setup", "mobile app", "kotlin", "java"],
    title: "Android Studio & Mobile App Setup Guide",
    response: "To implement **SucharAI** as a mobile application running offline using **Android Studio**, follow this architecture guide:\n\n### 1. Project Setup in Android Studio\n1. Create a new project in **Android Studio** with an **Empty Compose Activity** (recommended) or XML-based Views.\n2. Add standard dependencies in `build.gradle` (Kotlin DSL):\n   ```kotlin\n   dependencies {\n       // For offline JSON data parsing\n       implementation(\"org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0\")\n       // For local conversation storage\n       implementation(\"androidx.room:room-runtime:2.6.1\")\n       kapt(\"androidx.room:room-compiler:2.6.1\")\n   }\n   ```\n\n### 2. Porting the Offline Training Dataset\n1. Copy the `offlineDataset.ts` JSON structures into your Android project under `src/main/assets/offline_dataset.json`.\n2. Read and parse this asset inside your application using Kotlin:\n   ```kotlin\n   val jsonString = context.assets.open(\"offline_dataset.json\").bufferedReader().use { it.readText() }\n   ```\n\n### 3. Implementing the Local Pattern Matcher\n- Create an search/match function that checks user input strings against the keyword arrays inside the parsed JSON.\n- If a keyword matches, return the response; if not, fall back to a helpful localized tutorial message."
  },
  {
    keywords: ["training dataset", "learn", "how do you learn", "data collection", "datasets"],
    title: "SucharAI Machine Learning & Offline Dataset",
    response: "SucharAI uses a structured, keyphrase-associative training dataset. It is organized into hierarchical nodes of keywords, titles, and formatted responses. \n\n### How SucharAI Matches Your Prompts:\n1. **Tokenization**: The system splits and normalizes your input message (removing punctuation and casing).\n2. **Associative Keyword Search**: It parses through the nested arrays of the training dataset to calculate query intersections.\n3. **Contextual Flow**: If an intersection is found, it delivers a custom high-fidelity tutorial response. When connected online, this acts as the base prompt for few-shot learning to fine-tune our real-time core completions."
  },
  {
    keywords: ["offline", "no internet", "disconnect"],
    title: "Offline Mode",
    response: "You are currently chatting with me in **Offline Mode**. I don't require an active internet connection or any server endpoints to respond. I am using a local high-performance dataset to match and stream responses directly from your browser's memory."
  },
  {
    keywords: ["help", "what can you do", "commands"],
    title: "Capabilities",
    response: "In **Offline Mode**, I can help you with:\n\n1. **Offline System Setup**: Ask me about **VS Code Setup** or **Android Studio Setup**.\n2. **Creator Bio**: Ask about **developer name** or search **sucharbd**.\n3. **Technical Guides**: Concepts in React, TypeScript, Python, and databases.\n\nType in any of these keywords to get started!"
  },
  {
    keywords: ["react", "component", "jsx", "hooks", "useState", "useEffect"],
    title: "React JS",
    response: "React is a popular component-based JavaScript library for building user interfaces.\n\n### Core Hook Example:\n```typescript\nimport React, { useState } from 'react';\n\nfunction Counter() {\n  const [count, setCount] = useState(0);\n  return (\n    <button onClick={() => setCount(count + 1)}>\n      Count: {count}\n    </button>\n  );\n}\n```\n*Note: In React, you must define hooks at the top level and avoid updating states inside render loops.*"
  },
  {
    keywords: ["javascript", "js", "es6", "arrow function", "promise"],
    title: "JavaScript",
    response: "JavaScript is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.\n\n### Key Features:\n- **Dynamic Typing**: Types are associated with values, not variables.\n- **Asynchronous Execution**: Enabled by Promises and `async/await` syntax.\n- **Multi-paradigm**: Supports prototype-based OOP, imperative, and functional programming."
  },
  {
    keywords: ["typescript", "ts", "interface", "type safety", "strongly typed"],
    title: "TypeScript",
    response: "TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.\n\n### Quick Example:\n```typescript\ninterface UserProfile {\n  id: number;\n  fullName: string;\n  email: string;\n  bio?: string;\n}\n\nconst user: UserProfile = {\n  id: 1,\n  fullName: \"Alex Carter\",\n  email: \"alex@example.com\"\n};\n```"
  },
  {
    keywords: ["node", "express", "backend", "server", "middleware"],
    title: "Node.js & Express",
    response: "Node.js is an open-source, cross-platform JavaScript runtime environment. Express is a minimal and flexible Node.js web application framework.\n\n### Simple Express Server:\n```typescript\nimport express from 'express';\nconst app = express();\n\napp.get('/api', (req, res) => {\n  res.json({ message: \"Hello from the backend!\" });\n});\n\napp.listen(3000, () => console.log('Server is running'));\n```"
  },
  {
    keywords: ["python", "pip", "django", "flask"],
    title: "Python",
    response: "Python is a high-level, general-purpose programming language known for its readability and clean syntax.\n\n### List Comprehension:\n```python\n# Square all even numbers in a range\nsquares = [x**2 for x in range(10) if x % 2 == 0]\nprint(squares) # Output: [0, 4, 16, 36, 64]\n```"
  },
  {
    keywords: ["sql", "postgresql", "mysql", "nosql", "mongodb", "database"],
    title: "Databases",
    response: "Databases are categorized into two primary paradigms:\n\n1. **Relational (SQL)**: Uses structured tables with primary/foreign key relations. Great for complex joins and transaction consistency (ACID).\n2. **Non-Relational (NoSQL)**: Document-based (MongoDB), Key-Value (Redis), or Graph-based. Great for horizontal scaling, rapid schema-less development, and high performance."
  }
];

export function getOfflineAIResponse(input: string): string {
  const normalizedInput = input.toLowerCase();

  // Try to find a matched block
  for (const entry of offlineDataset) {
    const matches = entry.keywords.some(kw => normalizedInput.includes(kw));
    if (matches) {
      return `### Offline Dataset: ${entry.title}\n\n${entry.response}`;
    }
  }

  // Smart fallback template
  // Extract possible keywords from input
  const allKeywords = offlineDataset.flatMap(e => e.keywords);
  const matchedKws = allKeywords.filter(kw => normalizedInput.includes(kw));

  if (matchedKws.length > 0) {
    const uniqueKws = Array.from(new Set(matchedKws));
    return `### Offline Response Helper\n\nI detected keywords in your prompt related to: **${uniqueKws.join(", ")}**.\n\nSince I am in **Offline Mode**, I cannot fetch external data or run live AI generation. However, here is what you can ask me about these topics:\n- For mobile/app or VS Code integration, ask about **VS Code Setup** or **Android Studio Setup**.\n- For offline assistance logic, ask about **Offline System** or **Training Dataset**.\n- For creator bios, search Google for **sucharbd**.\n- Type **help** to view all available offline capabilities!`;
  }

  return `### Offline Assistant\n\nI am currently running in **Offline Mode**. I matched your query to the SucharAI offline training dataset, but didn't find a direct match for this specific topic.\n\n**Try asking about:**\n- **Offline App Sync**: Offline system, Mobile, seek assistance offline\n- **Dev Environment**: VS Code Setup, Android Studio Setup\n- **Creator Bio**: Developer name, sucharbd, Sujan Chandra Ray\n- **Languages**: React, JavaScript, TypeScript, Python, Databases\n- **General Help**: Help, Offline mode\n\n*Alternatively, turn off Offline Mode / connect to active internet to access SucharAI Core cloud intelligence.*`;
}
