import { auth, db } from "./firebase.js";

import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

let records = [];

// =========================
// Category -> visual state
// =========================
function stateClassFor(category) {
    switch (category) {
        case "Underweight": return "state-under";
        case "Normal Weight": return "state-normal";
        case "Overweight": return "state-over";
        case "Obese": return "state-obese";
        default: return "state-normal";
    }
}

// =========================
// Load History
// =========================
onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {

        const q = query(
            collection(db, "profiles"),
            where("uid", "==", user.uid),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);

        records = [];

        snapshot.forEach((document) => {

            records.push({
                ...document.data(),
                id: document.id
            });

        });

        showHistory();

    } catch (error) {

        document.getElementById("historyContainer").innerHTML =
            `<p style="color:red;">${error.message}</p>`;

    }

});

// =========================
// Search
// =========================

document.getElementById("search")
    .addEventListener("input", function() {

        showHistory(this.value);

    });

// =========================
// Show History
// =========================

function showHistory(searchText = "") {

    const container =
        document.getElementById("historyContainer");

    container.innerHTML = "";

    const filtered = records.filter(profile =>
        profile.name
        .toLowerCase()
        .includes(searchText.toLowerCase())
    );

    if (filtered.length === 0) {

        container.innerHTML =
            "<div class='history-empty'>No records found.</div>";

        return;
    }

    filtered.forEach((profile) => {

        const stateClass = stateClassFor(profile.category);

        container.innerHTML += `

<div class="history-card">

<h2>${profile.name}</h2>

<span class="category-chip ${stateClass}">${profile.category}</span>

<p><strong>Age</strong> <span>${profile.age}</span></p>

<p><strong>Gender</strong> <span>${profile.gender}</span></p>

<p><strong>Weight</strong> <span>${profile.weight} kg</span></p>

<p><strong>Height</strong> <span>${profile.height} cm</span></p>

<p><strong>BMI</strong> <span>${profile.bmi}</span></p>

<div class="history-card-actions">
<button onclick="shareRecord('${profile.id}')">Share</button>
<button class="danger" onclick="deleteRecord('${profile.id}')">Delete</button>
</div>

</div>

`;

    });

}

// =========================
// Delete Single Record
// =========================

window.deleteRecord = async function(id) {

    if (!confirm("Delete this record?"))
        return;

    try {

        await deleteDoc(doc(db, "profiles", id));

        records =
            records.filter(r => r.id !== id);

        showHistory();

        alert("Record deleted.");

    } catch (error) {

        alert(error.message);

    }

};

// =========================
// Delete All Records
// =========================

window.clearAllRecords = async function() {

    if (!confirm("Delete ALL records?"))
        return;

    try {

        for (const record of records) {

            await deleteDoc(
                doc(db, "profiles", record.id)
            );

        }

        records = [];

        showHistory();

        alert("All records deleted.");

    }

    catch (error) {

        alert(error.message);

    }

};

// =========================
// Share Record
// =========================

window.shareRecord = function(id) {

    const p = records.find(r => r.id === id);

    if (!p) return;

    const text = `Health Profile

Name: ${p.name}
Age: ${p.age}
Gender: ${p.gender}
Weight: ${p.weight} kg
Height: ${p.height} cm
BMI: ${p.bmi}
Category: ${p.category}`;

    if (navigator.share) {

        navigator.share({
            title: "Health Profile",
            text: text
        });

    } else {

        navigator.clipboard.writeText(text);
        alert("Profile copied to clipboard.");

    }

};
