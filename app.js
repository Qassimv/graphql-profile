// DOM Elements
const loginContainer = document.getElementById('login-container');
const profileContainer = document.getElementById('profile-container');
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const logoutBtn = document.getElementById('logout-btn');
const userLoginSpan = document.getElementById('user-login');
const xpChart = document.getElementById('xp-chart');
const progressChart = document.getElementById('progress-chart');
const statsInfo = document.getElementById('stats-info');

// GraphQL endpoint
const GRAPHQL_ENDPOINT = 'https://learn.reboot01.com/api/graphql-engine/v1/graphql';

// Global variable to track which auth method works
let GRAPHQL_AUTH_METHOD = 'bearer';

// JWT Token Fixer Function
function fixJWTToken(token) {
    console.log('Original token length:', token.length);
    console.log('Original token sample:', token.substring(0, 50) + '...');
    
    // Remove any extra characters that might be causing issues
    let fixedToken = token
        .trim()                          // Remove whitespace
        .replace(/[\r\n]/g, '')         // Remove line breaks
        .replace(/['"]/g, '')           // Remove quotes
        .replace(/\s/g, '');            // Remove all spaces
    
    console.log('Cleaned token length:', fixedToken.length);
    console.log('Cleaned token sample:', fixedToken.substring(0, 50) + '...');
    
    // Verify it has the right JWT structure
    const parts = fixedToken.split('.');
    console.log('JWT parts count:', parts.length);
    
    if (parts.length !== 3) {
        throw new Error(`Invalid JWT structure: expected 3 parts, got ${parts.length}`);
    }
    
    // Check each part length
    parts.forEach((part, index) => {
        console.log(`Part ${index + 1} length:`, part.length);
    });
    
    return fixedToken;
}

// Test function to immediately verify GraphQL works
async function testGraphQLWithToken(token) {
    console.log('=== TESTING GRAPHQL WITH FIXED TOKEN ===');
    
    const simpleQuery = `
        query {
            user {
                id
                login
            }
        }
    `;

    try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ query: simpleQuery }),
        });

        console.log('GraphQL test response status:', response.status);
        const responseData = await response.json();
        console.log('GraphQL test response:', responseData);

        if (responseData.errors) {
            console.error('❌ GraphQL still has errors:', responseData.errors);
            // Try without Bearer prefix
            return await testGraphQLWithoutBearer(token);
        } else if (responseData.data) {
            console.log('✅ GraphQL working! Proceeding with full data fetch...');
            fetchUserData();
        }
        
    } catch (error) {
        console.error('GraphQL test error:', error);
    }
}

// Test without Bearer prefix
async function testGraphQLWithoutBearer(token) {
    console.log('=== TESTING GRAPHQL WITHOUT BEARER PREFIX ===');
    
    const simpleQuery = `
        query {
            user {
                id
                login
            }
        }
    `;

    try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token,  // No "Bearer " prefix
            },
            body: JSON.stringify({ query: simpleQuery }),
        });

        console.log('GraphQL (no Bearer) response status:', response.status);
        const responseData = await response.json();
        console.log('GraphQL (no Bearer) response:', responseData);

        if (responseData.data && !responseData.errors) {
            console.log('✅ GraphQL working without Bearer prefix!');
            // Update the main function to not use Bearer
            GRAPHQL_AUTH_METHOD = 'no-bearer';
            fetchUserData();
        } else {
            console.log('❌ Still not working without Bearer prefix');
            statsInfo.innerHTML = `
                <div class="error">
                    <h4>Authentication Failed</h4>
                    <p>Unable to authenticate with GraphQL endpoint.</p>
                    <p>Error: ${responseData.errors ? responseData.errors[0].message : 'Unknown error'}</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('GraphQL (no Bearer) test error:', error);
    }
}

// Check if user is already logged in
function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        showProfile();
        fetchUserData();
    }
}

// Updated Login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        console.log('=== LOGIN ATTEMPT ===');
        
        const response = await fetch('https://learn.reboot01.com/api/auth/signin', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(`${username}:${password}`)}`,
            },
        });

        console.log('Login response status:', response.status);
        console.log('Login response headers:', [...response.headers.entries()]);

        if (!response.ok) {
            throw new Error('Invalid credentials');
        }

        const rawToken = await response.text();
        console.log('Raw token from server:', rawToken);
        
        try {
            const fixedToken = fixJWTToken(rawToken);
            console.log('Token after fixing:', fixedToken.substring(0, 50) + '...');
            
            // Test decode the fixed token
            const parts = fixedToken.split('.');
            const decodedPayload = JSON.parse(atob(parts[1]));
            console.log('✅ Token decoded successfully:', decodedPayload);
            
            localStorage.setItem('token', fixedToken);
            errorMessage.textContent = '';
            showProfile();
            
            // Test GraphQL immediately with the fixed token
            await testGraphQLWithToken(fixedToken);
            
        } catch (tokenError) {
            console.error('Token fixing failed:', tokenError);
            errorMessage.textContent = 'Token processing error: ' + tokenError.message;
        }

    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = 'Invalid username/email or password';
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    showLogin();
});

// Show/Hide containers
function showProfile() {
    loginContainer.classList.add('hidden');
    profileContainer.classList.remove('hidden');
}

function showLogin() {
    profileContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
}

// Updated fetchUserData function
async function fetchUserData() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No token found');
        return;
    }

    console.log('=== FETCHING USER DATA ===');

    const query = `
        query {
            user {
                id
                login
            }
            
            transaction(where: {type: {_eq: "xp"}}) {
                amount
                createdAt
                path
                object {
                    name
                    type
                }
            }
            
            progress {
                grade
                path
                createdAt
                object {
                    name
                    type
                }
            }
            
            result {
                id
                grade
                type
                path
                user {
                    id
                    login
                }
                object {
                    name
                    type
                }
            }
        }
    `;

    try {
        // Use the auth method that worked during login test
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': GRAPHQL_AUTH_METHOD === 'bearer' ? `Bearer ${token}` : token,
        };

        console.log('Using auth headers:', headers);

        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ query }),
        });

        console.log('GraphQL response status:', response.status);

        const data = await response.json();
        console.log('GraphQL response data:', data);

        if (data.errors) {
            console.error('GraphQL errors:', data.errors);
            
            // Show the specific error to the user
            statsInfo.innerHTML = `
                <div class="error">
                    <h4>GraphQL Error:</h4>
                    <p>${data.errors[0].message}</p>
                    <p>Check console for details.</p>
                </div>
            `;
            return;
        }

        if (data.data) {
            console.log('✅ Data received successfully!');
            updateUI(data.data);
        } else {
            console.error('No data in response');
            statsInfo.innerHTML = '<div class="error">No data received from server</div>';
        }

    } catch (error) {
        console.error('Fetch error:', error);
        statsInfo.innerHTML = `<div class="error">Network error: ${error.message}</div>`;
    }
}

// Update UI with fetched data
function updateUI(data) {
    console.log('Updating UI with data:', data);
    
    const { user, transaction, progress, result } = data;

    // Check if we have required data
    if (!user || user.length === 0) {
        console.error('No user data found');
        statsInfo.innerHTML = '<div class="error">No user data available</div>';
        return;
    }

    // 1. Basic user identification
    userLoginSpan.textContent = user[0].login;

    // 2. XP amount
    const totalXP = transaction ? transaction.reduce((sum, t) => sum + t.amount, 0) : 0;
    
    // 3. Grades (pass/fail ratio)
    let passed = 0;
    let failed = 0;
    let successRate = 0;
    
    if (progress && progress.length > 0) {
        passed = progress.filter(p => p.grade === 1).length;
        failed = progress.filter(p => p.grade === 0).length;
        successRate = ((passed / progress.length) * 100).toFixed(1);
    }

    // Process XP data for chart
    if (transaction && transaction.length > 0) {
        const xpData = transaction
            .map(t => ({
                date: new Date(t.createdAt).toLocaleDateString(),
                xp: t.amount,
                project: t.object ? t.object.name : 'Unknown'
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate cumulative XP
        let cumulativeXp = 0;
        const cumulativeXpData = xpData.map(item => {
            cumulativeXp += item.xp;
            return { ...item, cumulativeXp };
        });

        // Create XP chart
        createXPChart(cumulativeXpData);
    } else {
        xpChart.innerHTML = '<p style="text-align: center; padding: 20px;">No XP data available</p>';
    }

    // Create progress chart
    if (progress && progress.length > 0) {
        createProgressChart(passed, failed);
    } else {
        progressChart.innerHTML = '<p style="text-align: center; padding: 20px;">No progress data available</p>';
    }

    // Update statistics
    statsInfo.innerHTML = `
        <div class="stat-item">User: ${user[0].login}</div>
        <div class="stat-item">Total XP: ${totalXP}</div>
        <div class="stat-item">Success Rate: ${successRate}%</div>
        <div class="stat-item">Total Transactions: ${transaction ? transaction.length : 0}</div>
        <div class="stat-item">Progress Items: ${progress ? progress.length : 0}</div>
    `;
}

// Create XP chart using SVG
function createXPChart(data) {
    const width = xpChart.clientWidth || 400;
    const height = 300;
    const padding = 40;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    xpChart.innerHTML = '';
    xpChart.appendChild(svg);

    if (data.length === 0) {
        xpChart.innerHTML = '<p style="text-align: center; padding: 20px;">No XP data to display</p>';
        return;
    }

    // Calculate scales
    const xScale = (width - padding * 2) / Math.max(data.length - 1, 1);
    const yMax = Math.max(...data.map(d => d.cumulativeXp));
    const yScale = (height - padding * 2) / yMax;

    // Create line
    const points = data.map((d, i) => {
        const x = padding + i * xScale;
        const y = height - padding - d.cumulativeXp * yScale;
        return `${x},${y}`;
    }).join(' ');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#007bff');
    polyline.setAttribute('stroke-width', '2');
    svg.appendChild(polyline);

    // Add axes
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', padding);
    xAxis.setAttribute('y1', height - padding);
    xAxis.setAttribute('x2', width - padding);
    xAxis.setAttribute('y2', height - padding);
    xAxis.setAttribute('stroke', '#000');
    svg.appendChild(xAxis);

    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', padding);
    yAxis.setAttribute('y1', padding);
    yAxis.setAttribute('x2', padding);
    yAxis.setAttribute('y2', height - padding);
    yAxis.setAttribute('stroke', '#000');
    svg.appendChild(yAxis);

    // Add interactive tooltips
    data.forEach((d, i) => {
        const x = padding + i * xScale;
        const y = height - padding - d.cumulativeXp * yScale;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#007bff');
        circle.setAttribute('cursor', 'pointer');
        
        // Add hover effect
        circle.addEventListener('mouseover', () => {
            const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltip.setAttribute('x', x + 10);
            tooltip.setAttribute('y', y - 10);
            tooltip.setAttribute('fill', '#000');
            tooltip.setAttribute('font-size', '12');
            tooltip.textContent = `XP: ${d.xp}, Total: ${d.cumulativeXp}`;
            svg.appendChild(tooltip);
            
            circle.setAttribute('r', '6');
        });
        
        circle.addEventListener('mouseout', () => {
            const tooltips = svg.getElementsByTagName('text');
            if (tooltips.length > 0) {
                svg.removeChild(tooltips[tooltips.length - 1]);
            }
            circle.setAttribute('r', '4');
        });
        
        svg.appendChild(circle);
    });

    // Add title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', width / 2);
    title.setAttribute('y', 20);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '14');
    title.setAttribute('font-weight', 'bold');
    title.textContent = 'XP Progress Over Time';
    svg.appendChild(title);
}

// Create progress chart using SVG
function createProgressChart(passed, failed) {
    const width = progressChart.clientWidth || 400;
    const height = 300;
    const radius = Math.min(width, height) / 2 - 40;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    progressChart.innerHTML = '';
    progressChart.appendChild(svg);

    const centerX = width / 2;
    const centerY = height / 2;

    const total = passed + failed;
    if (total === 0) {
        progressChart.innerHTML = '<p style="text-align: center; padding: 20px;">No progress data to display</p>';
        return;
    }

    // Calculate angles
    const passedAngle = (passed / total) * 360;

    // Create pie segments with animation
    const createArc = (startAngle, endAngle, color) => {
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;

        const x1 = centerX + radius * Math.cos(startRad);
        const y1 = centerY + radius * Math.sin(startRad);
        const x2 = centerX + radius * Math.cos(endRad);
        const y2 = centerY + radius * Math.sin(endRad);

        const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${centerX},${centerY} L ${x1},${y1} A ${radius},${radius} 0 ${largeArcFlag},1 ${x2},${y2} Z`);
        path.setAttribute('fill', color);
        
        // Add animation
        path.style.opacity = '0';
        path.style.transition = 'opacity 0.5s ease-in-out';
        setTimeout(() => {
            path.style.opacity = '1';
        }, 100);
        
        svg.appendChild(path);
        
        // Add hover effect
        path.addEventListener('mouseover', () => {
            path.style.filter = 'brightness(1.2)';
        });
        
        path.addEventListener('mouseout', () => {
            path.style.filter = 'brightness(1)';
        });
    };

    createArc(0, passedAngle, '#28a745');
    createArc(passedAngle, 360, '#dc3545');

    // Add labels
    const addLabel = (text, x, y, fontSize = '14') => {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', y);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', fontSize);
        label.setAttribute('fill', '#000');
        label.textContent = text;
        svg.appendChild(label);
    };

    addLabel('Pass/Fail Ratio', centerX, 30, '16');
    addLabel(`Passed: ${passed}`, centerX, centerY - 10);
    addLabel(`Failed: ${failed}`, centerX, centerY + 10);
    addLabel(`${((passed / total) * 100).toFixed(1)}% Success Rate`, centerX, height - 20, '12');
}

// Initialize
checkAuth();