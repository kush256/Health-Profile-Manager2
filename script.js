import { auth, db } from "./firebase.js";

import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Holds the latest generated profile
let currentProfile = null;

// =============================
// Save Profile to Cloud
// =============================
window.saveProfile = async function () {

    if (!currentProfile) {
        alert("Please generate Health Summary first.");
        return;
    }

    try {

        await addDoc(
            collection(db, "profiles"),
            {
                ...currentProfile,
                email: auth.currentUser.email,
                uid: auth.currentUser.uid,
                createdAt: serverTimestamp()
            }
        );

        alert("✅ Profile saved to Cloud!");

        document.getElementById("saveBtn").style.display = "none";

    } catch (error) {

        alert(error.message);

    }

};

// =============================
// Calculate Age
// =============================
function calculateAge() {

    const dob = document.getElementById("dob").value;

    if (dob === "") {
        document.getElementById("age").value = "";
        return "";
    }

    const birthDate = new Date(dob);
    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDifference =
        today.getMonth() - birthDate.getMonth();

    if (
        monthDifference < 0 ||
        (monthDifference === 0 &&
            today.getDate() < birthDate.getDate())
    ) {
        age--;
    }

    document.getElementById("age").value = age;

    return age;
}

// =============================
// Vitals Dial (gauge)
// =============================
function updateGauge(bmi, stateClass) {

    const needle = document.getElementById("gaugeNeedle");
    const bmiValue = document.getElementById("bmiValue");
    const bmiCategory = document.getElementById("bmiCategory");

    // Map bmi range 15-40 to the 0-1 sweep of the half-circle gauge
    const min = 15, max = 40;
    const clamped = Math.min(Math.max(bmi, min), max);
    const percent = (clamped - min) / (max - min);

    // theta sweeps 180deg (left) -> 0deg (right) through the top
    const theta = 180 - (180 * percent);
    const radians = theta * (Math.PI / 180);

    const cx = 100, cy = 100, len = 62;
    const x2 = cx + len * Math.cos(radians);
    const y2 = cy - len * Math.sin(radians);

    needle.setAttribute("x2", x2.toFixed(1));
    needle.setAttribute("y2", y2.toFixed(1));

    bmiValue.textContent = bmi.toFixed(1);

    const labels = {
        "state-under": "Underweight",
        "state-normal": "Normal weight",
        "state-over": "Overweight",
        "state-obese": "Obese"
    };
    bmiCategory.textContent = labels[stateClass] || "";
}

// =============================
// Calculate BMI
// =============================
function calculateBMI() {

    const age = calculateAge();

    const name =
        document.getElementById("name").value.trim();

    const weight =
        Number(document.getElementById("weight").value);

    const heightCm =
        Number(document.getElementById("height").value);

    const height = heightCm / 100;

    let gender = "";

    if (document.getElementById("male").checked) {
        gender = "Male";
    }
    else if (document.getElementById("female").checked) {
        gender = "Female";
    }

    // =============================
    // Validation
    // =============================

    if (name === "") {
        alert("Please enter your name.");
        document.getElementById("name").focus();
        return;
    }

    if (age === "" || isNaN(age)) {
        alert("Please select your Date of Birth.");
        document.getElementById("dob").focus();
        return;
    }

    if (gender === "") {
        alert("Please select your gender.");
        return;
    }

    if (weight <= 0 || heightCm <= 0) {
        alert("Please enter valid Height and Weight.");
        return;
    }

    // =============================
    // BMI
    // =============================

    const bmi = weight / (height * height);

    let category = "";
    let stateClass = "";

    const advice =
        document.getElementById("advice");

    if (bmi < 18.5) {

        category = "Underweight";
        stateClass = "state-under";

        advice.innerHTML =
            "Eat a balanced diet to gain healthy weight.";
    }

    else if (bmi < 25) {

        category = "Normal Weight";
        stateClass = "state-normal";

        advice.innerHTML =
            "Excellent! Keep maintaining your healthy lifestyle.";
    }

    else if (bmi < 30) {

        category = "Overweight";
        stateClass = "state-over";

        advice.innerHTML =
            "Exercise regularly and reduce junk food.";
    }

    else {

        category = "Obese";
        stateClass = "state-obese";

        advice.innerHTML =
            "Consult a doctor and start a weight-loss plan.";
    }

    advice.className = "advice-box " + stateClass;
    advice.style.display = "block";

    updateGauge(bmi, stateClass);

    // =============================
    // Health Profile Summary
    // =============================

    document.getElementById("result").innerHTML = `
<hr>

<h2>Health Profile Summary</h2>

<p><strong>Name</strong> <span>${name}</span></p>

<p><strong>Age</strong> <span>${age} yrs</span></p>

<p><strong>Gender</strong> <span>${gender}</span></p>

<p><strong>Weight</strong> <span>${weight} kg</span></p>

<p><strong>Height</strong> <span>${heightCm} cm</span></p>

<p><strong>BMI</strong> <span>${bmi.toFixed(2)}</span></p>

<p><strong>Category</strong> <span>${category}</span></p>
`;

// Create Health Profile Object
const profile = {
    localId: Date.now(),
    name,
    age,
    gender,
    weight,
    height: heightCm,
    bmi: bmi.toFixed(2),
    category,
    createdAt: new Date().toLocaleString()
};
currentProfile = profile;

// Show Save Record button
document.getElementById("saveBtn").style.display = "inline-block";

    // =============================
    // Reading Box
    // =============================

    const reading =
        document.getElementById("reading");

    if (bmi >= 25) {

        reading.innerHTML = `
<strong>Recommended Reading</strong>

<ul class="reading-list">

<li>

<a href="https://www.eufic.org/en/healthy-living/article/what-are-the-best-ways-to-lose-weight-according-to-science" target="_blank">

What are the best ways to lose weight, according to science?

</a>

</li>

<li>

<a href="https://www.goodrx.com/conditions/weight-loss/tips-to-lose-weight" target="_blank">

13 Weight-Loss Tips, Backed by Science

</a>

</li>

</ul>
`;

        reading.style.display = "block";
    }

    else {

        reading.innerHTML = "";

        reading.style.display = "none";
    }

}

// =============================
// Reset
// =============================
function resetForm() {

   // Hide Save Record button
document.getElementById("saveBtn").style.display = "none";

    document.getElementById("name").value = "";

    document.getElementById("dob").value = "";

    document.getElementById("age").value = "";

    document.getElementById("weight").value = "";

    document.getElementById("height").value = "";

    document.getElementById("male").checked = false;

    document.getElementById("female").checked = false;

    document.getElementById("result").innerHTML = "";

    const advice = document.getElementById("advice");

    advice.innerHTML = "";

    advice.className = "advice-box";

    advice.style.display = "none";

    const reading =
        document.getElementById("reading");

    reading.innerHTML = "";

    reading.style.display = "none";

    document.getElementById("gaugeNeedle").setAttribute("x2", "100");
    document.getElementById("gaugeNeedle").setAttribute("y2", "30");
    document.getElementById("bmiValue").textContent = "--";
    document.getElementById("bmiCategory").textContent = "Awaiting data";

    document.getElementById("name").focus();
}

window.calculateAge = calculateAge;
window.calculateBMI = calculateBMI;
window.resetForm = resetForm;
