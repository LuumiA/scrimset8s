// @ts-nocheck
const { createClient } = supabase;

const supabaseUrl = "https://hcpgiocsgsqwpkpyxmcj.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGdpb2NzZ3Nxd3BrcHl4bWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5Mzg0NzUsImV4cCI6MjA4MTUxNDQ3NX0.fD3dDeL7MmI-0Hs8MShIVl-Euy9MLBQunwTUXrOwMZw";

const client = createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let currentTeam = null;

// ---------- UI AUTH (email topbar + popup) ----------

function updateUserEmail() {
  const span = document.getElementById("user-email");
  const btn = document.getElementById("open-auth");
  if (span) span.textContent = currentUser ? currentUser.email : "";
  if (btn)
    btn.textContent = currentUser ? "Déconnexion" : "Login / Inscription";
}

function openAuth() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.classList.add("visible");
  document.body.classList.add("auth-open");
}

function closeAuth() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.classList.remove("visible");
  document.body.classList.remove("auth-open");
}

// ---------- AUTH (signup / login) ----------

async function handleSignUp(e) {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  const { data, error } = await client.auth.signUp({ email, password });

  const status = document.getElementById("status");
  if (error) {
    status.innerText = "Erreur inscription: " + error.message;
  } else {
    status.innerText = "Compte créé, vérifie tes mails.";
    closeAuth();
    console.log(data);
  }
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  const status = document.getElementById("status");
  if (error) {
    status.innerText = "Erreur connexion: " + error.message;
  } else {
    status.innerText = "Connecté en tant que " + email;
    closeAuth();
    console.log(data);
  }
}

// ---------- DONNÉES : team / scrims / matchs / classement ----------

async function loadCurrentTeam() {
  if (!currentUser) {
    currentTeam = null;
    return;
  }

  const { data, error } = await client
    .from("teams")
    .select("*")
    .eq("owner_id", currentUser.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Erreur load team", error);
    currentTeam = null;
  } else {
    currentTeam = data;

    const createSection = document.getElementById("team-create-section");
    const infoSection = document.getElementById("team-info-section");
    const nameDisplay = document.getElementById("team-name-display");

    if (currentTeam && infoSection && createSection) {
      // on a une équipe → on affiche "Mon équipe"
      createSection.style.display = "none";
      infoSection.style.display = "block";
      if (nameDisplay) {
        nameDisplay.textContent = `Nom : ${currentTeam.name}`;
      }
      loadTeamMembers();
    } else if (createSection && infoSection) {
      // pas d'équipe → on affiche le formulaire de création
      createSection.style.display = "block";
      infoSection.style.display = "none";
    }

    console.log("Current team:", currentTeam);
  }
}

document.getElementById("team-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    document.getElementById("team-status").innerText =
      "Tu dois être connecté pour créer une équipe.";
    return;
  }

  const name = document.getElementById("team-name").value;

  const { data, error } = await client
    .from("teams")
    .insert([{ name, owner_id: currentUser.id }])
    .select();

  if (error) {
    document.getElementById("team-status").innerText =
      "Erreur création équipe: " + error.message;
  } else {
    document.getElementById("team-status").innerText =
      "Équipe créée: " + data[0].name;
    console.log("Team:", data[0]);
    loadCurrentTeam();
    loadLeaderboard();
  }
});

document.getElementById("scrim-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUser) {
    document.getElementById("scrim-status").innerText =
      "Tu dois être connecté.";
    return;
  }
  if (!currentTeam) {
    document.getElementById("scrim-status").innerText =
      "Tu dois avoir une équipe pour créer un scrim.";
    return;
  }

  const scheduled_at = document.getElementById("scrim-time").value;
  const mode = document.getElementById("scrim-mode").value;

  const { data, error } = await client
    .from("scrims")
    .insert([
      {
        team_a_id: currentTeam.id,
        scheduled_at,
        mode,
        status: "open",
      },
    ])
    .select();

  if (error) {
    document.getElementById("scrim-status").innerText =
      "Erreur création scrim: " + error.message;
  } else {
    document.getElementById("scrim-status").innerText = "Scrim créé.";
    loadOpenScrims();
  }
});

async function loadOpenScrims() {
  const { data, error } = await client
    .from("scrims")
    .select("*")
    .eq("status", "open")
    .order("scheduled_at", { ascending: true });

  const list = document.getElementById("scrim-list");
  list.innerHTML = "";

  if (error) {
    list.innerText = "Erreur chargement scrims: " + error.message;
    return;
  }

  data.forEach((scrim) => {
    const li = document.createElement("li");
    li.textContent = `${scrim.mode} - ${scrim.scheduled_at}`;

    const btn = document.createElement("button");
    btn.textContent = "Accepter";
    btn.onclick = () => acceptScrim(scrim.id);

    li.appendChild(document.createTextNode(" "));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function acceptScrim(id) {
  if (!currentUser || !currentTeam) {
    alert("Tu dois être connecté avec une équipe pour accepter un scrim.");
    return;
  }

  const { error } = await client
    .from("scrims")
    .update({
      team_b_id: currentTeam.id,
      status: "accepted",
    })
    .eq("id", id)
    .eq("status", "open");

  if (error) {
    alert("Erreur acceptation scrim: " + error.message);
  } else {
    loadOpenScrims();
    loadMyMatches();
  }
}

async function loadMyMatches() {
  const list = document.getElementById("my-matches");
  list.innerHTML = "";

  if (!currentTeam) {
    list.innerText = "Pas encore d'équipe.";
    return;
  }

  const { data, error } = await client
    .from("scrims")
    .select("*")
    .or(`team_a_id.eq.${currentTeam.id},team_b_id.eq.${currentTeam.id}`)
    .order("scheduled_at", { ascending: true });

  if (error) {
    list.innerText = "Erreur chargement matchs: " + error.message;
    return;
  }

  if (!data || !data.length) {
    list.innerText = "Aucun match pour l'instant.";
    return;
  }

  data.forEach((scrim) => {
    const li = document.createElement("li");
    const isTeamA = scrim.team_a_id === currentTeam.id;
    const vs = isTeamA ? "Adversaire (team B)" : "Adversaire (team A)";

    let text = `${scrim.mode} - ${scrim.scheduled_at} - statut: ${scrim.status} - ${vs}`;

    if (scrim.status === "finished") {
      text += ` | Score: ${scrim.score_team_a} - ${scrim.score_team_b}`;
      li.textContent = text;
      list.appendChild(li);
      return;
    }

    li.textContent = text;

    if (scrim.status === "accepted") {
      const inputA = document.createElement("input");
      inputA.type = "number";
      inputA.min = 0;
      inputA.placeholder = "Score A";

      const inputB = document.createElement("input");
      inputB.type = "number";
      inputB.min = 0;
      inputB.placeholder = "Score B";

      const btn = document.createElement("button");
      btn.textContent = "Reporter le score";
      btn.onclick = async () => {
        const sA = parseInt(inputA.value, 10);
        const sB = parseInt(inputB.value, 10);
        if (Number.isNaN(sA) || Number.isNaN(sB)) {
          alert("Entre les deux scores.");
          return;
        }

        const { error: scrimError } = await client
          .from("scrims")
          .update({
            score_team_a: sA,
            score_team_b: sB,
            status: "finished",
          })
          .eq("id", scrim.id);

        if (scrimError) {
          alert("Erreur report score: " + scrimError.message);
          return;
        }

        let pointsA = 0;
        let pointsB = 0;
        if (sA > sB) {
          pointsA = 3;
        } else if (sB > sA) {
          pointsB = 3;
        } else {
          pointsA = 1;
          pointsB = 1;
        }

        const updates = [];
        if (pointsA > 0) {
          updates.push(
            client.rpc("increment_team_points", {
              team_id_input: scrim.team_a_id,
              points_input: pointsA,
            })
          );
        }
        if (pointsB > 0) {
          updates.push(
            client.rpc("increment_team_points", {
              team_id_input: scrim.team_b_id,
              points_input: pointsB,
            })
          );
        }

        await Promise.all(updates);

        loadMyMatches();
        loadLeaderboard();
      };

      li.appendChild(document.createTextNode(" "));
      li.appendChild(inputA);
      li.appendChild(inputB);
      li.appendChild(btn);
    }

    list.appendChild(li);
  });
}

async function loadLeaderboard() {
  const list = document.getElementById("leaderboard");
  if (!list) return;

  const { data, error } = await client
    .from("teams")
    .select("name, points")
    .order("points", { ascending: false });

  list.innerHTML = "";

  if (error) {
    list.innerText = "Erreur classement: " + error.message;
    return;
  }

  data.forEach((team) => {
    const li = document.createElement("li");
    li.textContent = `${team.name} - ${team.points} pts`;
    list.appendChild(li);
  });
}

// ---------- NAVIGATION ENTRE SECTIONS ----------

document.querySelectorAll(".nav-link[data-section]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-section");

    document
      .querySelectorAll(".nav-link[data-section]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    document
      .querySelectorAll(".panel")
      .forEach((sec) => sec.classList.remove("visible"));
    document.getElementById(target).classList.add("visible");
  });
});

// ---------- BOUTON LOGIN / DÉCONNEXION + CROIX + FORM ----------

document.addEventListener("DOMContentLoaded", () => {
  const openAuthBtn = document.getElementById("open-auth");
  const closeAuthBtn = document.getElementById("close-auth");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");

  if (openAuthBtn) {
    openAuthBtn.addEventListener("click", async () => {
      if (!currentUser) {
        openAuth();
      } else {
        // 1. On reset tout côté front
        currentUser = null;
        updateUserEmail();
        currentTeam = null;
        loadCurrentTeam();
        loadMyMatches();
        loadOpenScrims();
        loadLeaderboard();

        // 2. On tente quand même le signOut, mais on ne le bloque pas si 403
        const { error } = await client.auth.signOut();
        if (error) {
          console.warn(
            "Erreur Supabase signOut (ignorée sur GitHub) :",
            error.message
          );
        }

        // 3. On force un refresh pour être sûr
        window.location.reload();
      }
    });
  }

  if (closeAuthBtn) {
    closeAuthBtn.addEventListener("click", () => {
      closeAuth();
    });
  }

  if (signupForm) signupForm.addEventListener("submit", handleSignUp);
  if (loginForm) loginForm.addEventListener("submit", handleSignIn);

  const renameBtn = document.getElementById("rename-team-btn");
  const deleteBtn = document.getElementById("delete-team-btn");

  if (renameBtn) {
    renameBtn.addEventListener("click", async () => {
      if (!currentTeam) return;
      const newName = prompt("Nouveau nom de l'équipe :", currentTeam.name);
      if (!newName) return;
      const { data, error } = await client
        .from("teams")
        .update({ name: newName })
        .eq("id", currentTeam.id)
        .select();
      if (error) {
        alert("Erreur renommage: " + error.message);
      } else {
        currentTeam = data[0];
        loadCurrentTeam();
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!currentTeam) return;
      if (!confirm("Supprimer définitivement l'équipe ?")) return;
      const { error } = await client
        .from("teams")
        .delete()
        .eq("id", currentTeam.id);
      if (error) {
        alert("Erreur suppression: " + error.message);
      } else {
        currentTeam = null;
        loadCurrentTeam();
        loadLeaderboard();
      }
    });
  }
});

// ---------- SUPABASE: LISTEN AUTH STATE ----------

client.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  updateUserEmail();

  loadCurrentTeam().then(() => {
    loadMyMatches();
    loadOpenScrims();
    loadLeaderboard();
  });
});

async function loadTeamMembers() {
  const list = document.getElementById("team-members");
  if (!list) return;
  list.innerHTML = "";

  if (!currentTeam) {
    list.innerHTML = "<li>Aucune équipe.</li>";
    return;
  }

  // à adapter au nom de ta table de membres
  const { data, error } = await client
    .from("team_members")
    .select("user_email")
    .eq("team_id", currentTeam.id);

  if (error) {
    list.innerHTML = "<li>Erreur chargement membres.</li>";
    return;
  }

  if (!data || !data.length) {
    list.innerHTML = "<li>Pas encore de joueurs dans l'équipe.</li>";
    return;
  }

  data.forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m.user_email;
    list.appendChild(li);
  });
}
