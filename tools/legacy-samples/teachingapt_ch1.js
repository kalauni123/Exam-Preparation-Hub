window.teachingaptCh1 = [
    {
        id: "T1-01", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "A particle of mass \\(m\\) moves under a potential energy \\(U(x) = \\frac{1}{2}kx^2 + \\frac{1}{4}ax^4\\). What is the restoring force?",
        options: { A: "\\( F = kx + ax^3 \\)", B: "\\( F = -kx - ax^3 \\)", C: "\\( F = -\\frac{1}{2}kx \\)", D: "\\( F = kx - ax^3 \\)" },
        correctAnswer: "B",
        explanation: "Force is the negative gradient of potential energy: \\(F(x) = -\\frac{dU}{dx} = -kx - ax^3\\)."
    },
    {
        id: "T1-02", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "What is the mathematical condition for a force field \\(\\mathbf{F}\\) to be strictly conservative?",
        options: { A: "\\( \\nabla \\cdot \\mathbf{F} = 0 \\)", B: "\\( \\nabla \\times \\mathbf{F} = 0 \\)", C: "\\( \\nabla^2 \\mathbf{F} = 0 \\)", D: "\\( \\oint \\mathbf{F} \\cdot d\\mathbf{S} = 0 \\)" },
        correctAnswer: "B",
        explanation: "By Stokes' theorem, the line integral around a closed loop is zero (zero work) if and only if the curl of the force field is identically zero everywhere."
    },
    {
        id: "T1-03", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "The Work-Energy Theorem states that the work done by the net force equals the change in kinetic energy. It is valid for:",
        options: { A: "Conservative forces only.", B: "Non-conservative forces only.", C: "Both conservative and non-conservative forces.", D: "Inertial frames only." },
        correctAnswer: "C",
        explanation: "Derived from Newton's Second Law, it applies to all forces provided \\(W_{net}\\) accounts for every force acting on the particle."
    },
    {
        id: "T1-04", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "A potential energy curve \\(U(x)\\) has a local maximum at \\(x = x_0\\). What type of equilibrium is this?",
        options: { A: "Stable", B: "Unstable", C: "Neutral", D: "Dynamic" },
        correctAnswer: "B",
        explanation: "At a maximum, \\(\\frac{d^2U}{dx^2} < 0\\). A small displacement results in a force pushing the particle away from equilibrium."
    },
    {
        id: "T1-05", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "A rocket of mass \\(M\\) ejects gas at relative velocity \\(u\\). The equation of motion is:",
        options: { A: "\\( M \\frac{dv}{dt} = -u \\frac{dM}{dt} \\)", B: "\\( M \\frac{dv}{dt} = u \\frac{dM}{dt} \\)", C: "\\( \\frac{d(Mv)}{dt} = 0 \\)", D: "\\( M \\frac{dv}{dt} = \\frac{1}{2} u^2 \\frac{dM}{dt} \\)" },
        correctAnswer: "A",
        explanation: "From conservation of momentum for a variable mass system, thrust equals the mass ejection rate multiplied by the relative exhaust velocity."
    },
    {
        id: "T1-06", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "If the net force on a particle is strictly velocity-dependent, \\(F(v) = -kv\\), what happens to its velocity as \\(t \\to \\infty\\)?",
        options: { A: "Approaches infinity", B: "Approaches zero", C: "Remains constant", D: "Oscillates" },
        correctAnswer: "B",
        explanation: "Solving the differential equation \\(m \\frac{dv}{dt} = -kv\\) yields an exponentially decaying velocity \\(v(t) = v_0 e^{-kt/m}\\)."
    },
    {
        id: "T1-07", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "In two-body collisions with no external forces, what is ALWAYS conserved regardless of elasticity?",
        options: { A: "Kinetic Energy", B: "Mechanical Energy", C: "Linear Momentum", D: "Relative Velocity" },
        correctAnswer: "C",
        explanation: "Internal forces cancel out per Newton's Third Law, conserving total linear momentum in all collision types."
    },
    {
        id: "T1-08", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "The angular momentum \\(\\mathbf{L}\\) of a particle is conserved if and only if:",
        options: { A: "The net force on the particle is zero.", B: "The net external torque on the particle is zero.", C: "The particle moves in a perfect circle.", D: "The central force is proportional to distance." },
        correctAnswer: "B",
        explanation: "Since \\(\\frac{d\\mathbf{L}}{dt} = \\boldsymbol{\\tau}_{net}\\), angular momentum is strictly conserved when the net external torque is zero."
    },
    {
        id: "T1-09", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "For a particle moving under the influence of a central force \\(F(r)\\mathbf{\\hat{r}}\\), its areal velocity is:",
        options: { A: "Proportional to \\(r^2\\)", B: "Zero", C: "Constant", D: "Exponentially decaying" },
        correctAnswer: "C",
        explanation: "A central force exerts zero torque about the origin. Thus, angular momentum is conserved, which geometrically corresponds to a constant areal velocity (Kepler's Second Law)."
    },
    {
        id: "T1-10", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "In a one-dimensional perfectly inelastic collision between a mass \\(m\\) moving at \\(v\\) and an identical mass at rest, the fractional loss of kinetic energy is:",
        options: { A: "0%", B: "25%", C: "50%", D: "100%" },
        correctAnswer: "C",
        explanation: "Initial KE = \\(0.5mv^2\\). After collision, mass is \\(2m\\), velocity is \\(v/2\\). Final KE = \\(0.5(2m)(v/2)^2 = 0.25mv^2\\). The loss is half the initial energy, or 50%."
    },
    {
        id: "T1-11", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "The gravitational potential \\(V(r)\\) inside a uniform solid sphere of mass \\(M\\) and radius \\(R\\) (for \\(r < R\\)) is given by:",
        options: { A: "\\( -\\frac{GM}{r} \\)", B: "\\( -\\frac{GM}{2R^3}(3R^2 - r^2) \\)", C: "Zero", D: "\\( -\\frac{GM}{R} \\)" },
        correctAnswer: "B",
        explanation: "Integrating the gravitational field inside a solid sphere from infinity yields a parabolic potential curve: \\(V(r) = -\\frac{GM}{2R^3}(3R^2 - r^2)\\)."
    },
    {
        id: "T1-12", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "According to Kepler's Third Law, the square of the orbital period \\(T\\) of a planet is proportional to:",
        options: { A: "The semi-major axis \\(a\\)", B: "The square of the semi-major axis \\(a^2\\)", C: "The cube of the semi-major axis \\(a^3\\)", D: "The mass of the planet" },
        correctAnswer: "C",
        explanation: "Kepler's Third Law states \\(T^2 \\propto a^3\\), derived from equating gravitational force to centripetal force for circular orbits."
    },
    {
        id: "T1-13", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "Escape velocity \\(v_e\\) from the surface of a spherical planet of mass \\(M\\) and radius \\(R\\) is:",
        options: { A: "\\( \\sqrt{GM/R} \\)", B: "\\( \\sqrt{2GM/R} \\)", C: "\\( 2GM/R \\)", D: "\\( GM/R^2 \\)" },
        correctAnswer: "B",
        explanation: "Setting total mechanical energy to zero at infinity: \\(\\frac{1}{2}mv_e^2 - \\frac{GMm}{R} = 0\\), solving for \\(v_e\\) yields \\(\\sqrt{2GM/R}\\)."
    },
    {
        id: "T1-14", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "The moment of inertia of a uniform solid cylinder of mass \\(M\\) and radius \\(R\\) about its central longitudinal axis is:",
        options: { A: "\\( MR^2 \\)", B: "\\( \\frac{1}{2}MR^2 \\)", C: "\\( \\frac{2}{5}MR^2 \\)", D: "\\( \\frac{1}{12}MR^2 \\)" },
        correctAnswer: "B",
        explanation: "Integrating \\(r^2 dm\\) over a solid cylinder yields \\(\\frac{1}{2}MR^2\\)."
    },
    {
        id: "T1-15", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "For a rigid body rolling without slipping on a horizontal surface, the ratio of its rotational kinetic energy to its total kinetic energy depends purely on:",
        options: { A: "Its mass", B: "Its radius", C: "Its shape (moment of inertia factor)", D: "Its linear velocity" },
        correctAnswer: "C",
        explanation: "Total KE = \\(K_{trans} + K_{rot} = \\frac{1}{2}Mv^2 + \\frac{1}{2}I\\omega^2\\). Since \\(v = \\omega R\\), the ratio depends entirely on the geometric factor \\(k\\) where \\(I = kMR^2\\)."
    },
    {
        id: "T1-16", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "When a solid sphere and a hollow spherical shell of the same mass and radius roll down an incline without slipping, which reaches the bottom first?",
        options: { A: "Solid sphere", B: "Hollow shell", C: "They arrive simultaneously", D: "Depends on the incline angle" },
        correctAnswer: "A",
        explanation: "The solid sphere has a smaller moment of inertia factor (2/5 vs 2/3), meaning less energy goes into rotation and more into linear translation, resulting in higher linear acceleration."
    },
    {
        id: "T1-17", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "For a simple harmonic oscillator of mass \\(m\\) and spring constant \\(k\\), the angular frequency \\(\\omega\\) is:",
        options: { A: "\\( \\sqrt{m/k} \\)", B: "\\( \\sqrt{k/m} \\)", C: "\\( k/m \\)", D: "\\( 2\\pi\\sqrt{k/m} \\)" },
        correctAnswer: "B",
        explanation: "From the equation of motion \\(m\\ddot{x} + kx = 0\\), we define \\(\\omega^2 = k/m\\), thus \\(\\omega = \\sqrt{k/m}\\)."
    },
    {
        id: "T1-18", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "In a damped harmonic oscillator, if the damping coefficient is equal to the critical damping value, the system will:",
        options: { A: "Oscillate with decreasing amplitude indefinitely.", B: "Return to equilibrium as fast as possible without oscillating.", C: "Take an infinitely long time to return to equilibrium.", D: "Oscillate with constant amplitude." },
        correctAnswer: "B",
        explanation: "Critical damping (where the damping ratio is 1) provides the fastest return to equilibrium without the system undergoing any oscillations."
    },
    {
        id: "T1-19", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "The Quality Factor \\(Q\\) of a lightly damped harmonic oscillator is defined as \\(2\\pi\\) times the ratio of:",
        options: { A: "Energy stored to energy dissipated per cycle.", B: "Energy dissipated to energy stored per cycle.", C: "Amplitude to initial amplitude.", D: "Resonant frequency to damping constant." },
        correctAnswer: "A",
        explanation: "By definition, \\(Q = 2\\pi \\frac{E}{\\Delta E}\\), where \\(E\\) is the total energy stored and \\(\\Delta E\\) is the energy dissipated in one cycle."
    },
    {
        id: "T1-20", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "The Equation of Continuity in fluid mechanics (\\(A_1 v_1 = A_2 v_2\\)) for an incompressible fluid is a direct consequence of the conservation of:",
        options: { A: "Energy", B: "Momentum", C: "Mass", D: "Angular Momentum" },
        correctAnswer: "C",
        explanation: "For an incompressible fluid (constant density), the mass flow rate must be constant across any cross-section. Thus, Volume flow rate \\(Av\\) is constant, reflecting conservation of mass."
    },
    {
        id: "T1-21", subjectCode: "TECH", chapterCode: "TECH-01",
        question: "Bernoulli's theorem for an incompressible, non-viscous fluid undergoing steady flow is essentially a statement of:",
        options: { A: "Conservation of Mass", B: "Conservation of Energy", C: "Conservation of Linear Momentum", D: "Newton's Third Law" },
        correctAnswer: "B",
        explanation: "Bernoulli's equation equates the work done by pressure to the changes in kinetic and potential energy per unit volume, which is conservation of energy."
    }
];
