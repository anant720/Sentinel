import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

async function runTest(port, secure) {
    console.log(`\n--- Testing SMTP on Port ${port} (Secure: ${secure}) ---`);
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: port,
        secure: secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        debug: true, // Enable debug output
        logger: true // Log to console
    });

    try {
        await transporter.verify();
        console.log(`✅ SMTP Connection verified on Port ${port}!`);
        return true;
    } catch (error) {
        console.error(`❌ Port ${port} failed:`, error.message);
        return false;
    }
}

async function test() {
    const p587 = await runTest(587, false);
    if (!p587) {
        await runTest(465, true);
    }
}

test();
