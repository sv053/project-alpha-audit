const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function basicAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).send("Authentication required");
  }

  const base64 = auth.split(" ")[1];
  const [user, pass] = Buffer.from(base64, "base64")
    .toString()
    .split(":");

  if (
    user === process.env.ADMIN_USER &&
    pass === process.env.ADMIN_PASS
  ) {
    return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
  return res.status(401).send("Invalid credentials");
}

function isValidAirbnbUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("airbnb.");
  } catch {
    return false;
  }
}

app.get("/", (req, res) => {
  res.render("home", {
    error: null,
    formData: {
      name: "",
      email: "",
      airbnb_url: "",
      notes: ""
    }
  });
});

app.post("/submit", (req, res) => {
  const { name, email, airbnb_url, notes } = req.body;

  const formData = {
    name: (name || "").trim(),
    email: (email || "").trim(),
    airbnb_url: (airbnb_url || "").trim(),
    notes: (notes || "").trim()
  };

  if (!formData.name || !formData.email || !formData.airbnb_url) {
    return res.status(400).render("home", {
      error: "Please fill in all required fields.",
      formData
    });
  }

  if (!isValidAirbnbUrl(formData.airbnb_url)) {
    return res.status(400).render("home", {
      error: "Please enter a valid Airbnb listing URL.",
      formData
    });
  }

  const query = `
    INSERT INTO submissions (name, email, airbnb_url, notes)
    VALUES (?, ?, ?, ?)
  `;

  db.run(
    query,
    [formData.name, formData.email, formData.airbnb_url, formData.notes],
    function (err) {
      if (err) {
        console.error("Insert error:", err);
        return res.status(500).render("home", {
          error: "Something went wrong. Please try again.",
          formData
        });
      }

      transporter.sendMail(
        {
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_USER,
          subject: "New Airbnb audit request",
          text: `
Name: ${formData.name}
Email: ${formData.email}
URL: ${formData.airbnb_url}
Notes: ${formData.notes}
          `
        },
        (mailErr) => {
          if (mailErr) {
            console.error("Email error:", mailErr);
          }
        }
      );

      return res.redirect("/thanks");
    }
  );
});

app.get("/thanks", (req, res) => {
  res.render("thanks");
});

app.get("/admin", basicAuth, (req, res) => {
  db.all(
    `
      SELECT id, name, email, airbnb_url, notes, status, created_at
      FROM submissions
      ORDER BY created_at DESC
    `,
    [],
    (err, rows) => {
      if (err) {
        console.error("Select error:", err);
        return res.status(500).send("Database error");
      }

      res.render("admin", { submissions: rows });
    }
  );
});

app.post("/admin/update-status/:id", basicAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedStatuses = ["new", "in_progress", "done"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).send("Invalid status");
  }

  db.run(
    `UPDATE submissions SET status = ? WHERE id = ?`,
    [status, id],
    (err) => {
      if (err) {
        console.error("Update error:", err);
        return res.status(500).send("Database error");
      }

      res.redirect("/admin");
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});