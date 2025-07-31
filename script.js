const { useState, useEffect, useMemo, useSyncExternalStore } = React;

// --- Database Setup ---
const room = new WebsimSocket();
const customizationsCollection = room.collection('leaderboard_customization_v2');

// --- Helper Functions ---
const fetchAllTipComments = async (projectId) => {
    let allComments = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
        const params = new URLSearchParams({ only_tips: 'true' });
        if (cursor) {
            params.append('after', cursor);
        }
        const response = await fetch(`/api/v1/projects/${projectId}/comments?${params.toString()}`);
        if (!response.ok) {
            console.error("Failed to fetch comments:", response.statusText);
            break;
        }
        const data = await response.json();
        const comments = data.comments.data;
        allComments.push(...comments);
        hasNextPage = data.comments.has_next_page;
        if(hasNextPage) {
            cursor = comments[comments.length-1]?.cursor;
            if(!cursor) break; // safety break
        }
    }
    return allComments;
};

const aggregateTips = (comments) => {
    const userTips = comments.reduce((acc, { comment }) => {
        if (comment.card_data?.type === 'tip_comment' && comment.author) {
            const { id, username } = comment.author;
            const amount = comment.card_data.credits_spent;
            if (!acc[id]) {
                acc[id] = { id, username, totalTips: 0 };
            }
            acc[id].totalTips += amount;
        }
        return acc;
    }, {});

    return Object.values(userTips).sort((a, b) => b.totalTips - a.totalTips);
};


// --- React Components ---

const CustomizationControls = ({ user, customization, onSave }) => {
    const [bgColor, setBgColor] = useState(customization?.backgroundColor || '#2c2c2c');

    const handleSave = () => {
        onSave({ backgroundColor: bgColor });
    };

    return (
        <div className="customization-controls">
            <h4>Customize Your Card</h4>
            <div className="control-group">
                <label htmlFor="bgColor">Background Color:</label>
                <input
                    type="color"
                    id="bgColor"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                />
            </div>
            <button onClick={handleSave}>Save</button>
        </div>
    );
};

const LeaderboardItem = ({ user, rank, customization, currentUser }) => {
    const [showCustomize, setShowCustomize] = useState(false);
    const isCurrentUser = currentUser?.id === user.id;

    const rankIcons = {
        1: './crown-gold.png',
        2: './crown-silver.png',
        3: './crown-bronze.png',
    };

    const handleSaveCustomization = async (data) => {
        if (customization?.id) {
            await customizationsCollection.update(customization.id, data);
        } else {
            // Explicitly add username to ensure the record is associated correctly from the client-side.
            await customizationsCollection.create({ ...data, username: user.username });
        }
        setShowCustomize(false);
    };

    const cardStyle = {
        background: customization?.backgroundColor,
    };

    return (
        <li className={`leaderboard-item rank-${rank}`} style={cardStyle}>
            <div className="item-main-info">
                <span className="rank">{rank}</span>
                <img className="avatar" src={`https://images.websim.com/avatar/${user.username}`} alt={`${user.username}'s avatar`} />
                <span className="username">{user.username}</span>
                {rank <= 3 && <img className="rank-icon" src={rankIcons[rank]} alt={`Rank ${rank}`} />}
                <span className="total-tips">{user.totalTips.toLocaleString()} credits</span>
            </div>
            {isCurrentUser && rank <= 3 && (
                <div className="customization-area">
                    <button className="customize-toggle" onClick={() => setShowCustomize(!showCustomize)}>
                        {showCustomize ? 'Cancel' : 'Customize'}
                    </button>
                    {showCustomize && (
                        <CustomizationControls
                            user={user}
                            customization={customization}
                            onSave={handleSaveCustomization}
                        />
                    )}
                </div>
            )}
        </li>
    );
};

const Leaderboard = () => {
    const [leaderboard, setLeaderboard] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [project, setProject] = useState(null);

    const customizations = useSyncExternalStore(
        customizationsCollection.subscribe,
        customizationsCollection.getList
    );

    const customizationsMap = useMemo(() => {
        return customizations.reduce((acc, cust) => {
            acc[cust.username] = cust;
            return acc;
        }, {});
    }, [customizations]);
    
    const fetchData = async () => {
        const proj = await window.websim.getCurrentProject();
        setProject(proj);
        const user = await window.websim.getCurrentUser();
        setCurrentUser(user);
        
        const tipComments = await fetchAllTipComments(proj.id);
        const aggregatedData = aggregateTips(tipComments);
        setLeaderboard(aggregatedData);
    };

    useEffect(() => {
        fetchData();
        
        const handleNewComment = (e) => {
             const { comment } = e.data;
             if(comment.card_data?.type === 'tip_comment' && comment.project_id === project?.id) {
                // Refetch all data to ensure leaderboard is accurate
                fetchData();
             }
        };

        const cleanup = window.websim.addEventListener('comment:created', handleNewComment);

        return () => {
            if (typeof cleanup === 'function') {
                cleanup();
            }
        };
    }, [project?.id]); // Rerun if project ID changes, though it's unlikely.

    if (leaderboard.length === 0) {
        return <div className="loading">Loading leaderboard or no tips yet...</div>;
    }

    return (
        <div className="leaderboard-container">
            <h1>Tip Leaderboard</h1>
            <ol className="leaderboard-list">
                {leaderboard.map((user, index) => (
                    <LeaderboardItem
                        key={user.id}
                        user={user}
                        rank={index + 1}
                        customization={customizationsMap[user.username]}
                        currentUser={currentUser}
                    />
                ))}
            </ol>
        </div>
    );
};

const App = () => {
    return <Leaderboard />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);