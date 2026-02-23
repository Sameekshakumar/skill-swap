const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['Initial', 'Lock', 'Transfer', 'Refund'],
    required: true
  },
  amount: { type: Number, required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  description: String
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
