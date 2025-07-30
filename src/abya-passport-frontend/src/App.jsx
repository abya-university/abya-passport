import "./App.css";
import React, { useState } from "react";
import Navbar from "./components/Navbar";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <Navbar />
      {/* <div className="bg-gray-100 min-h-screen flex items-center justify-center flex-col my-4">
        <h2>Abya Passport Frontend</h2>
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={() => setCount(count + 1)}
        >
          Click Me!
        </button>
        <p>Count: {count}</p>
      </div> */}
    </>
  );
}

export default App;
