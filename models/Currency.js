const mongoose = require("mongoose");

const Currency = mongoose.model("Currency", {
  from: {
    currency: String,
    description: String,
  },
  to: {
    currency: String,
    description: String,
  },
  link: String,
  rate: Number,
  created: Date,
  updated: Date,
});

module.exports = Currency;
