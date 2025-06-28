const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files (e.g., receipts.html, CSS, JS)
app.use(express.static('.'));

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Format phone to international format for Kenya
function formatPhone(phone) {
  // Remove any spaces, dashes, or parentheses
  phone = phone.replace(/[\s\-\(\)]/g, '');
  
  // Handle different formats
  if (phone.startsWith("07")) return "254" + phone.slice(1);
  if (phone.startsWith("01")) return "254" + phone.slice(1);
  if (phone.startsWith("+254")) return phone.slice(1);
  if (phone.startsWith("254")) return phone;
  
  // If it's already in the right format or unknown format, return as is
  return phone;
}

// Validate phone number format
function isValidKenyanPhone(phone) {
  const formattedPhone = formatPhone(phone);
  // Kenyan mobile numbers start with 254 and have 12 digits total
  return /^254[17]\d{8}$/.test(formattedPhone);
}

// POST endpoint to handle SMS sending
app.post("/send-sms", async (req, res) => {
  console.log("Received SMS request:", req.body);
  
  const { phone, message } = req.body;
  
  if (!phone || !message) {
    return res.status(400).json({ 
      success: false, 
      error: "Phone number and message are required" 
    });
  }

  const formattedPhone = formatPhone(phone);
  
  if (!isValidKenyanPhone(phone)) {
    console.log("Invalid phone format:", phone, "->", formattedPhone);
    return res.status(400).json({ 
      success: false, 
      error: `Invalid phone number format: ${phone}. Please use format like 0712345678 or +254712345678` 
    });
  }

  // SMS payload with correct field names for CelcomAfrica API
  const smsPayload = {
    mobile: formattedPhone,
    message: message,
    partnerID: "371",
    shortcode: "HCS-SCHOOL",
    apikey: "817ed995ee8b687ff0c17b7d64dde6d3"
  };

  try {
    console.log("Sending SMS with payload:", smsPayload);
    
    const response = await axios.post(
      "https://isms.celcomafrica.com/api/services/sendsms", 
      smsPayload, 
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000 // 15 second timeout
      }
    );
    
    console.log("SMS API Response:", response.data);
    
    // Check if the response indicates success
    if (response.data && (response.data.success || response.data.status === 'success' || response.status === 200)) {
      res.json({ 
        success: true, 
        message: "SMS sent successfully",
        data: response.data,
        phone: formattedPhone
      });
    } else {
      console.log("SMS API returned non-success response:", response.data);
      res.status(400).json({ 
        success: false, 
        error: "SMS service returned error: " + (response.data?.message || "Unknown error"),
        details: response.data
      });
    }
    
  } catch (error) {
    console.error("SMS Sending Failed:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    let errorMessage = "Failed to send SMS";
    
    if (error.code === 'ECONNABORTED') {
      errorMessage = "SMS service timeout - please try again";
    } else if (error.response?.data) {
      errorMessage = error.response.data.message || error.response.data.error || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      phone: formattedPhone
    });
  }
});

// Enhanced fee payment notification endpoint
app.post("/notify-fee-payment", async (req, res) => {
  const { studentName, amount, parentPhone, receiptNumber, balance } = req.body;
  
  if (!studentName || !amount || !parentPhone) {
    return res.status(400).json({
      success: false,
      error: "Student name, amount, and parent phone are required"
    });
  }
  
  const message = `Dear parent to ${studentName}, we have received KES ${amount}. Balance: KES ${balance || 0}. Receipt #${receiptNumber || 'N/A'}. Thank you - Heriwadi Christian Schools`;
  
  try {
    // Use our own SMS endpoint
    const smsResponse = await axios.post(`http://localhost:${port}/send-sms`, {
      phone: parentPhone,
      message: message
    });
    
    res.json({ 
      success: true, 
      message: "Fee payment notification sent successfully",
      smsData: smsResponse.data 
    });
    
  } catch (error) {
    console.error("Failed to send fee payment notification:", error.message);
    res.status(500).json({ 
      success: false, 
      error: "Failed to send notification: " + (error.response?.data?.error || error.message)
    });
  }
});

// Test SMS endpoint for debugging
app.post("/test-sms", async (req, res) => {
  const testPayload = {
    phone: "0712345678", // Replace with a test number
    message: "Test message from Heriwadi Christian Schools system"
  };
  
  try {
    const response = await axios.post(`http://localhost:${port}/send-sms`, testPayload);
    res.json({
      success: true,
      message: "Test SMS sent successfully",
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Heriwadi Christian Schools SMS Service"
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'receipts.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server Error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Heriwadi Christian Schools Server is running at http://localhost:${port}`);
  console.log(`📧 SMS Service: Ready`);
  console.log(`📊 Health Check: http://localhost:${port}/health`);
  console.log(`🧪 Test SMS: POST to http://localhost:${port}/test-sms`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});