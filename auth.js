import { auth } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
// ==============================
// Sign Up
// ==============================
window.signUp = async function () {

    const email =
        document.getElementById("email").value.trim();

    const password =
        document.getElementById("password").value;

    if (email === "") {
        alert("Please enter your email.");
        return;
    }

    if (password.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
    }

    try {

        await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        alert("✅ Account Created Successfully!");

        window.location.href = "login.html";

    }

    catch (error) {

        alert(error.message);

    }

};
// ==============================
// Login
// ==============================
window.login = async function () {

    const email =
        document.getElementById("email").value.trim();

    const password =
        document.getElementById("password").value;

    if (email === "") {
        alert("Please enter your email.");
        return;
    }

    if (password === "") {
        alert("Please enter your password.");
        return;
    }

    try {

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        alert("✅ Login Successful!");

        window.location.href = "index.html";

    }

    catch (error) {

        alert(error.message);

    }

};
// ==============================
// Authentication Check
// ==============================
onAuthStateChanged(auth, (user) => {

    const page = window.location.pathname;

    if (user) {

        console.log("Logged in:", user.email);

        // Display logged-in user email
        const userEmail = document.getElementById("userEmail");
        if (userEmail) {
            userEmail.textContent = user.email;
        }

        // Prevent logged-in users from opening Login/Signup pages
        if (
            page.includes("login.html") ||
            page.includes("signup.html")
        ) {
            window.location.href = "index.html";
        }

    } else {

        // Protect all private pages
        if (
            page.includes("index.html") ||
            page.includes("history.html")
        ) {
            window.location.href = "login.html";
        }

    }

});
window.logout = async function () {

    try {

        await signOut(auth);

        alert("Logged out successfully.");

        window.location.href = "login.html";

    } catch (error) {

        alert(error.message);

    }

};
