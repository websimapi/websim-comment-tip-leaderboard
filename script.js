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

const DEFAULTS = {
    backgroundColor: '#2c2c2c',
    gradientEnabled: false,
    gradientColor1: '#3a3a3a',
    gradientColor2: '#2c2c2c',
    gradientAngle: 135,
    animation: 'none',
};

const CustomizationControls = ({ customization, onSave }) => {
    const [settings, setSettings] = useState({ ...DEFAULTS, ...customization });

    useEffect(() => {
        setSettings({ ...DEFAULTS, ...customization });
    }, [customization]);

    const handleSave = () => {
        onSave(settings);
    };
    
    const handleReset = () => {
        setSettings(DEFAULTS);
        onSave(DEFAULTS);
    }

    const handleSettingChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="customization-controls">
            <h4>Customize Your Card</h4>
            
            <fieldset className="control-group">
                <legend>Background</legend>
                <div className="control-row">
                    <label htmlFor="bgColor">Solid Color</label>
                    <input type="color" id="bgColor" value={settings.backgroundColor} onChange={(e) => handleSettingChange('backgroundColor', e.target.value)} disabled={settings.gradientEnabled} />
                </div>
                 <div className="control-row">
                    <label htmlFor="gradientEnabled">Enable Gradient</label>
                    <input type="checkbox" id="gradientEnabled" checked={settings.gradientEnabled} onChange={(e) => handleSettingChange('gradientEnabled', e.target.checked)} />
                </div>
                {settings.gradientEnabled && (
                    <>
                        <div className="control-row">
                             <label htmlFor="gradientColor1">Color 1</label>
                             <input type="color" id="gradientColor1" value={settings.gradientColor1} onChange={(e) => handleSettingChange('gradientColor1', e.target.value)} />
                        </div>
                         <div className="control-row">
                            <label htmlFor="gradientColor2">Color 2</label>
                            <input type="color" id="gradientColor2" value={settings.gradientColor2} onChange={(e) => handleSettingChange('gradientColor2', e.target.value)} />
                        </div>
                        <div className="control-row">
                             <label htmlFor="gradientAngle">Angle</label>
                             <input type="range" id="gradientAngle" min="0" max="360" value={settings.gradientAngle} onChange={(e) => handleSettingChange('gradientAngle', e.target.value)} />
                             <span>{settings.gradientAngle}°</span>
                        </div>
                    </>
                )}
            </fieldset>

            <fieldset className="control-group">
                 <legend>Animation</legend>
                 <div className="control-row">
                    <label htmlFor="animation">Effect</label>
                    <select id="animation" value={settings.animation} onChange={(e) => handleSettingChange('animation', e.target.value)}>
                        <option value="none">None</option>
                        <option value="glow">Glow</option>
                        <option value="pulse">Pulse</option>
                    </select>
                </div>
            </fieldset>

            <div className="actions">
                <button className="reset-btn" onClick={handleReset}>Reset</button>
                <button onClick={handleSave}>Save</button>
            </div>
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
            await customizationsCollection.create({ ...data, username: user.username });
        }
        setShowCustomize(false);
    };

    const cardStyle = {};
    const classNames = [`leaderboard-item rank-${rank}`];

    const effectiveCustomization = { ...DEFAULTS, ...customization };

    if (effectiveCustomization.gradientEnabled && effectiveCustomization.gradientColor1 && effectiveCustomization.gradientColor2) {
        cardStyle.background = `linear-gradient(${effectiveCustomization.gradientAngle}deg, ${effectiveCustomization.gradientColor1}, ${effectiveCustomization.gradientColor2})`;
    } else if (effectiveCustomization.backgroundColor) {
        cardStyle.background = effectiveCustomization.backgroundColor;
    }

    if (effectiveCustomization.animation && effectiveCustomization.animation !== 'none') {
        classNames.push(`animation-${effectiveCustomization.animation}`);
    }

    return (
        <li className={classNames.join(' ')} style={cardStyle}>
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
    const [isLoading, setIsLoading] = useState(true);

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
        setIsLoading(true);
        const proj = await window.websim.getCurrentProject();
        setProject(proj);
        const user = await window.websim.getCurrentUser();
        setCurrentUser(user);
        
        const tipComments = await fetchAllTipComments(proj.id);
        const aggregatedData = aggregateTips(tipComments);
        setLeaderboard(aggregatedData);
        setIsLoading(false);
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

    if (isLoading) {
        return <div className="loading">Loading leaderboard...</div>;
    }
    
    if (leaderboard.length === 0) {
        return <div className="loading">No tips have been given yet. Be the first!</div>;
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