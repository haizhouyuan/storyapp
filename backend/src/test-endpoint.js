// Test endpoint with intentional issues for Claude Code Review
const express = require('express');
const router = express.Router();

// Issue 1: No input validation
router.post('/user-data', (req, res) => {
    const { username, email, password } = req.body;
    
    // Issue 2: Direct database query without sanitization (SQL injection risk)
    const query = `INSERT INTO users (username, email, password) VALUES ('${username}', '${email}', '${password}')`;
    
    // Issue 3: Storing plain text password
    console.log('Password:', password); // Issue 4: Logging sensitive data
    
    // Issue 5: No error handling
    res.json({ success: true, user: { username, email } });
});

// Issue 6: No rate limiting on sensitive endpoint
router.post('/reset-password', (req, res) => {
    const email = req.body.email;
    
    // Issue 7: No email validation
    // Issue 8: Potential for timing attacks
    if (email === 'admin@test.com') {
        res.json({ message: 'Reset link sent' });
    } else {
        res.json({ message: 'User not found' });
    }
});

// Issue 9: Exposing internal system information
router.get('/debug', (req, res) => {
    res.json({
        env: process.env,
        version: process.version,
        platform: process.platform
    });
});

module.exports = router;