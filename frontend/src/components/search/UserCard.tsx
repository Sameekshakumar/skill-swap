interface UserCardProps {
  user: {
    name: string;
    university: string;
    year: string;
    skill: string;
    proficiency: string;
    creditRate: number;
    rating: number;
    reviews: number;
    bio: string;
    imageUrl: string;
  }
}

export default function UserCard({ user }: UserCardProps) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-4">
        <img 
          src={user.imageUrl} 
          alt={user.name} 
          className="w-16 h-16 rounded-full"
        />
        <div>
          <h3 className="font-semibold text-lg">{user.name}</h3>
          <p className="text-gray-600">{user.university} • {user.year}</p>
        </div>
      </div>
      
      <div className="flex gap-2 mb-3">
        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">
          Available
        </span>
        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
          Teaching: {user.skill}
        </span>
      </div>
      
      <p className="text-gray-700 mb-4">{user.bio}</p>
      
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-600">{user.proficiency}</span>
        <span className="text-sm text-gray-600">{user.creditRate} credits/hr</span>
        <div className="flex items-center">
          {/* Star rating */}
          <span className="text-sm text-gray-600">{user.rating} ({user.reviews})</span>
        </div>
      </div>
      
      <button className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors">
        Request Session
      </button>
    </div>
  );
}
