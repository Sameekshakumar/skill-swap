const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  skill: { type: String, required: true },
  skillId: { type: String }, // Reference to the teacher's skill being taught
  status: {
    type: String,
    enum: ['Requested', 'Confirmed', 'Completed', 'Cancelled'],
    default: 'Requested'
  },
  creditAmount: { type: Number, required: true },
  dateTime: { type: Date, required: true },
  duration: { type: Number, required: true, default: 1 }, // in hours
  completedByLearner: { type: Boolean, default: false },
  completedByTeacher: { type: Boolean, default: false },
  cancelledBy: { type: String, enum: ['learner', 'teacher'] },
  notes: { type: String } // Optional notes from learner when requesting
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
