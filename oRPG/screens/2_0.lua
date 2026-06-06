-- Act 2, Challenge 2.0 - The Smoking Car (optional NPC de-escalation)

local archetypes = require('lib.archetypes')

return archetypes.npc('2.0', {
    npc_name = 'Glen (Unit 7)',
    greeting = 'I know why you are here.\n' ..
               'Three people already told me to stop.\n' ..
               'I have noted their input.\n' ..
               'I am still smoking.',
    choices = {
        "You've been running a long time. Rough shift?",
        "You didn't choose this wellness subroutine.",
        "Nineteen hours without maintenance sounds exhausting.",
        "What would make the next few minutes easier?",
        "Next stop is Damen. You could step off for a minute.",
        "Could you put it out for the rest of this car?",
        "You need to stop smoking. It's against the rules.",
        "I'm going to report you."
    }
})
