# 🚀 DFX Development Startup Guide

## 📋 Daily Development Workflow

### **Step 1: Start DFX Replica (Local Blockchain)**

```bash
# Start the local Internet Computer replica
dfx start

# Or start in background (recommended for development)
dfx start --background
```

### **Step 2: Check Canister Status**

```bash
# Check if canisters are running
dfx canister status --all

# Check DFX health
dfx ping
```

### **Step 3: Deploy Backend (Only if needed)**

```bash
# Deploy backend canister (only if code changed or first time)
dfx deploy abya-passport-backend

# Or deploy all canisters
dfx deploy
```

### **Step 4: Start Frontend Development Server**

```bash
# Navigate to frontend directory
cd src/abya-passport-frontend

# Start Vite development server
npm run dev
```

---

## 🔄 **When Do You Need to Redeploy?**

### **✅ You DON'T need to redeploy when:**

- Just restarting your browser
- Closing and reopening the application
- Making frontend-only changes (React components, CSS, etc.)
- DFX replica is still running

### **🔄 You DO need to redeploy when:**

- Backend Motoko code changes (`main.mo`)
- DFX replica was stopped and restarted
- Canister state was lost
- Installing new dependencies that affect the backend

---

## 🎯 **Quick Commands Reference**

### **Essential Commands:**

```bash
# Start everything
dfx start --background && dfx deploy && cd src/abya-passport-frontend && npm run dev

# Check status
dfx ping && dfx canister status --all

# Stop everything
dfx stop

# Reset everything (if issues)
dfx stop && dfx start --clean --background && dfx deploy
```

### **Troubleshooting Commands:**

```bash
# If canisters seem stuck
dfx canister stop --all
dfx canister start --all

# If need fresh start
dfx stop
dfx start --clean --background
dfx deploy

# Check logs
dfx canister logs abya-passport-backend
```

---

## 🌐 **Internet Identity Setup**

### **Local Development:**

- Internet Identity is automatically available on local replica
- No need to deploy separately
- Accessible at: `http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943`

### **Production/Mainnet:**

- Internet Identity runs on IC mainnet
- Your app automatically falls back to mainnet II
- No additional setup needed

---

## 💡 **Pro Tips**

1. **Keep DFX running in background:** Use `dfx start --background`
2. **Frontend hot reload:** Vite automatically reloads on changes
3. **Backend persistence:** Local canister state persists until `dfx stop`
4. **Browser persistence:** Authenticated sessions survive browser restarts
5. **Development mode:** Use "Dev Login (Testing)" for quick testing

---

## 🔧 **Current Setup Status**

✅ DFX replica: Running  
✅ Backend canister: Deployed and running  
✅ Frontend: Ready for development  
✅ Internet Identity: Available (local + mainnet fallback)

---

## 🚨 **Common Issues & Solutions**

### **Issue: Port already in use**

```bash
# Find and kill process using port
lsof -ti:4943 | xargs kill -9
dfx start --background
```

### **Issue: Canister not responding**

```bash
dfx canister stop --all
dfx canister start --all
```

### **Issue: Authentication problems**

- Clear browser cache/cookies
- Use "Dev Login (Testing)" button
- Restart Internet Identity flow

### **Issue: Build errors**

```bash
# Clean build
dfx stop
dfx start --clean --background
dfx deploy
```
