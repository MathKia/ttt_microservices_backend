📘 README.md – Tic Tac Toe Microservices Backend

🧠 PROJECT DESCRIPTION
  This backend powers a real-time multiplayer Tic Tac Toe application with chat. It uses a Node.js microservices architecture to provide:
   - Authentication (JWT)
   - Room management (2-player logic)
   - Socket-based gameplay and messaging

COMPATIBILITY WITH:
   - 🌐 React web frontend
   - 💻 Python desktop app
   - 📱 React Native mobile app

🌐 DEPLOYMENT NOTE
    - This README is focused on setting up and running the backend locally for development or testing purposes.
    - The production version of this backend is deployed on an AWS EC2 instance with Nginx acting as a reverse proxy and SSL termination layer.
    - If you're interested in deploying this to a cloud server or contributing to the hosted version, feel free to contact me.
  
🛠️ FOLDER STRUCTURE

  tic-tac-toe-backend/
  ├── apiGatewayService.js        # Handles routing & proxying between frontends and microservices
  ├── authService.js              # Auth logic: login, signup, JWT generation
  ├── authRoutes.js               # Express routes for authentication API
  ├── roomManagerService.js       # Room join and exit logic
  ├── roomManagerRoutes.js        # Express routes for room API
  ├── chatService.js              # Socket.IO chat microservice
  ├── gameService.js              # Socket.IO game microservice
  ├── tokenMiddleware/
  │   └── tokenMiddleware.js      # JWT generation and verification for protected routes
  ├── .env                        # Environment variables (create your own based on example below)
  ├── package.json                # NPM dependencies and scripts
  └── README.md

⚙️ ENVIORNMENT VARIABLES

  Use a .env file (not committed) with the following variables:
  
  REACT_ORIGIN_URL=http://localhost:5173
  
  # Gateway + service endpoints
  AUTH_API_BASE_URL=http://localhost:4000/api/auth
  ROOM_API_BASE_URL=http://localhost:4000/api/room
  API_GW_ADD=http://localhost:4000
  API_GW_PORT=4000
  AUTH_ADD=http://localhost:4100
  AUTH_PORT=4100
  ROOM_ADD=http://localhost:4200
  ROOM_PORT=4200
  CHAT_ADD=http://localhost:4300/chat
  CHAT_PORT=4300
  GAME_ADD=http://localhost:4400/game
  GAME_PORT=4400
  
  # PostgreSQL
  PG_USER=postgres
  PG_HOST=localhost
  PG_AUTH_DATABASE=your_auth_database_name
  PG_AUTH_TABLE=your_auth_table_name
  PG_ROOM_DATABASE=your_room_database_name
  PG_ROOM_TABLE=your_room_table_name
  PG_PASSWORD=your_pg_password
  PG_PORT=5432
  
  # JWT
  JWT_SECRET=your_jwt_secret_key
  JWT_EXPIRES_IN=1h
  
  NODE_ENV=development
  
  *🔐 Important: Do not commit real secrets or database info. Use .env.example in your repo and .gitignore your real .env.

🛢POSTGRESQL DATABASE SETUP:

  - You will have to create your own databases. You can use tools like pgAdmin or the PostgreSQL CLI to set these up.
  - Two databases are needed:
    1. Authentication Database (persistent) = Stores user credentials (usernames and hashed passwords).
       CREATE DATABASE your_auth_database_name;

       CREATE TABLE your_auth_table_name (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL
       );
       
    2. Room Management Database (temporary) = Tracks active game rooms and participating players.
       CREATE DATABASE your_room_database_name;

       CREATE TABLE your_room_table_name (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        roomname VARCHAR(100) NOT NULL,
        service VARCHAR(100) NOT NULL,
        isfull BOOLEAN DEFAULT false,
        slot_number INTEGER
       );

📦 SERVICES BREAKDOWN

  1. 🛡️ API Gateway
    - Unified entry point for frontend HTTP requests
    - Proxies requests to /api/auth and /api/room
    - Sends validated socket service URLs to frontend after joining a room
  
  2. 👤 Authentication Service
     Handles user registration, login, token issuance, authentication, and logout across all platforms.
   
  🔐 REST API Endpoints:
    -> POST /signup
      - Params: mode = 'browser' | 'desktop' | 'mobile'
      - Body: { username, password }
      - Description: Registers a new user. The mode parameter helps determine where the JWT token should be stored (cookie for browser, in-memory for mobile, or secure storage for desktop).
    -> POST /login
      - Params: mode = 'browser' | 'desktop' | 'mobile'
      - Body: { username, password }
      - Description: Authenticates a user and issues a JWT token based on mode:
        > Browser: JWT is set as a HttpOnly cookie.
        > Mobile/Desktop: JWT is returned in response and stored in frontend app state or secure storage.
    -> GET /profile
      - Params: mode = 'browser' | 'desktop' | 'mobile'
      - Headers/Cookies: JWT passed via:
        > Cookie (browser mode)
        > Authorization header (mobile)
      - Description: 
        > Validates the JWT and returns the user's profile data on first render of frontend to bypass login, only used for mobile or webapp, not desktop.
        > > Authenticates the request. Failure of authentication likely from auth token expiration results in logout.
    -> POST /logout
      - Params: mode = 'browser' | 'desktop' | 'mobile' | 'socket'
      - Description: removes users auth token to ensure complete logout.
        > Browser: Clears the JWT cookie.
        > Mobile/Desktop: Frontend clears token from local/secure storage.
        > Socket: Used by the Game Service during disconnections to trigger cleanup (e.g., exit room, invalidate session).
        
  🗄️ Storage:
    -> User data (username, hashed password) is stored in a PostgreSQL authentication database.
    -> Passwords are hashed using bcrypt for security.
    
  🔒 Token Handling:
    -> A custom TokenMiddleware module handles JWT generation, validation, and route protection across HTTP and WebSocket layers.
  
 3. 🧩 Room Manager Service
    Manages game room lifecycle: joining, leaving, and tracking room status.

    🏗 REST API Endpoints:
      -> POST /join
        - Params: mode = 'browser' | 'desktop' | 'mobile'
        - Headers/Cookies: JWT for auth (via cookie or Authorization header depending on mode)
        - Body: { roomname, username }
        - Description:
          > Authenticates the request. Failure of authentication likely from auth token expiration results in logout.
          > Registers the user in the room (creates it if it doesn’t exist).
          > Ensures max 2 players per room.
      -> POST /exit
        - Params: mode = 'browser' | 'desktop' | 'mobile'
        - Headers/Cookies: JWT for auth
        - Body: { roomname, username }
        - Description:
          > Authenticates the request. Failure of authentication likely from auth token expiration results in logout.
          > Removes the user from the room.
          > Deletes the room if no users are left.

  📊 Storage:
    -> Room state is stored in a PostgreSQL rooms database, used as a temporary session manager to coordinate room data for the Game and Chat microservices.

  🔁 Coordination:
    -> After successful join, the API gateway shares the relevant socket service addresses with the frontend, which then directly connects to:
      - Chat Service (via WebSocket)
      - Game Service (via WebSocket)
  
  4. 🎮 Game Service
    - Socket.IO server
    - Handles:
      > Player X/O assignment
      > Turn syncing
      > Win/draw results
      > Rematches and exits
      > JWT handshake for auth
  
  5. 💬 Chat Service
    - Socket.IO server
    - Handles:
     > Real-time messaging
     > Timestamps + usernames
     > JWT handshake for auth

🖼️ Architecture Diagram
Here’s how the services interact:

![image](https://github.com/user-attachments/assets/4f676e8d-9a7a-445b-97a1-9c0a641a2547)                 
  
🔗 INTER-SERVICE COMMUNICATION
  - Each service runs on a different port. The flow is:
    > Frontend hits api-gateway → /api/auth or /api/room
    > If authenticated, room-service returns Chat/Game socket URLs
    > Frontend connects directly to chat-service and game-service via Socket.IO using JWT handshake
    > Room deletion removes all traces from memory

🧪 Running Locally

  1. Clone repo

      git clone https://github.com/MathKia/ttt_microservices_backend.git
      cd ttt_microservices_backend

  2. Install dependencies 

      npm install

  3. Configure Environment
     Create a .env file in the project root and populate it using the Environment Variables section above.
     Make sure your actual .env file is excluded from Git by having it listed in .gitignore.

 4. Start all services
  
  You can run each microservice in a separate terminal, or use a process manager like pm2 or concurrently. Make sure you are in the project's folder.

  Option A: Manually (Separate Terminals)
    node apiGatewayService.js
    node authService.js
    node roomManagerService.js
    node chatService.js
    node gameService.js

  Option B: Automatically with concurrently
    Install concurrently (if you haven't):
      npm install -g concurrently
   Then start all services:
      concurrently \
        "nodemon apiGatewayService.js" \
        "nodemon authService.js" \
        "nodemon roomManagerService.js" \
        "nodemon chatService.js" \
        "nodemon gameService.js"
      
  💡 nodemon will automatically restart services when file changes are detected. Install it globally with:
      npm install -g nodemon

🔐 Security Notes
  - All services validate JWTs for protected actions
  - Only registered users can join games or chat
  - Database stores hashed credentials only — no emails or PII
  - CORS policies configured to allow only trusted frontends 

🌐 Related Repositories
Platform	         Repository
  Web App	           https://github.com/MathKia/ttt_micro_webapp
  Desktop App	       https://github.com/MathKia/ttt_micro_desktopapp
  Mobile App	       https://github.com/MathKia/ttt_mobile_frontend

🙋 Support
Feel free to open an issue or email me if you have questions or want to fork the project.
