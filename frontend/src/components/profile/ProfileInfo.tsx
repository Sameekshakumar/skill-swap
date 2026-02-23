interface ProfileInfoProps {
  user: {
    name: string;
    email: string;
    college: string;
    yearOfStudy: string;
    bio: string;
    avatar: string;
  };
  onEdit: () => void;
}

export default function ProfileInfo({ user, onEdit }: ProfileInfoProps) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-semibold">Profile Information</h2>
        <button
          onClick={onEdit}
          className="text-purple-600 hover:text-purple-700"
        >
          Edit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <img src={user.avatar} alt={user.name} className="w-24 h-24 rounded-full" />
          <div>
            <h3 className="font-medium">Name</h3>
            <p className="text-gray-600">{user.name}</p>
          </div>
          <div>
            <h3 className="font-medium">College</h3>
            <p className="text-gray-600">{user.college}</p>
          </div>
          <div>
            <h3 className="font-medium">Bio</h3>
            <p className="text-gray-600">{user.bio}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Email</h3>
            <p className="text-gray-600">{user.email}</p>
          </div>
          <div>
            <h3 className="font-medium">Year of Study</h3>
            <p className="text-gray-600">{user.yearOfStudy}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
