// Person 4: sign up, log in and log out with Firebase Authentication
// (email + password).

import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase.js";

// Firebase error codes -> messages people understand.
const ERROR_MESSAGES = {
  "auth/invalid-email": "That email doesn't look right.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/email-already-in-use": "There's already an account with this email. Log in instead.",
  "auth/weak-password": "Password needs at least 6 characters.",
  "auth/missing-password": "Enter a password.",
};

export default function Login({ user }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // No Firebase settings in frontend/.env: show nothing. The site works the same, just without accounts.
  if (!auth) return null;

  if (user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-gray-600 sm:inline">{user.email}</span>
        <button onClick={() => signOut(auth)} className="rounded-xl border border-gray-300 px-3 py-1.5 hover:bg-gray-100">
          Log out
        </button>
      </div>
    );
  }

  async function submit(action) {
    setError("");
    try {
      if (action === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] || err.message);
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700">
        Log in
      </button>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit("login");
          }}
          className="absolute right-0 z-10 mt-2 w-72 space-y-3 rounded-2xl bg-white p-4 shadow-lg"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-gray-300 px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-xl bg-gray-900 py-2 text-white hover:bg-gray-700">
              Log in
            </button>
            <button
              type="button"
              onClick={() => submit("signup")}
              className="flex-1 rounded-xl border border-gray-300 py-2 hover:bg-gray-100"
            >
              Sign up
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
