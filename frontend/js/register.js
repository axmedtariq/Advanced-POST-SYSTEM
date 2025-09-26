const API_BASE = 'http://localhost:3000/api';

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const role = document.getElementById('role').value;

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role })
    });

    const data = await res.json();
    if (data.ok) {
      alert('Registered successfully! You can now login.');
      window.location.href = 'login.html';
    } else {
      alert(data.error || 'Registration failed');
    }
  } catch (err) {
    console.error(err);
    alert('Server error');
  }
});
