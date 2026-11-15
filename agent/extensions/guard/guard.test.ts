// Manual test for findDanger: npx tsx guard.test.ts
import { findDanger } from "./guard.js";

const CWD = "/home/lumilno/project";
const check = (cmd: string) => findDanger(cmd, CWD);

const shouldFlag: [string, string][] = [
   ["rm file.txt", "rm in project"],
   ["rm -rf /home/lumilno/project", "rm -rf outside /tmp"],
   ["rm -rf /", "rm -rf /"],
   ["rm /tmp/ok /etc/passwd", "mixed: one target outside /tmp"],
   ["rm -rf /tmp/../etc", "path escaping /tmp"],
   ["sudo rm -rf /etc", "sudo rm outside /tmp"],
   ["rmdir /opt/foo", "rmdir outside /tmp"],
   ["unlink /etc/hosts", "unlink outside /tmp"],
   ["apt install nginx", "apt install"],
   ["sudo apt-get install nginx", "sudo apt-get install"],
   ["apk add curl", "apk add"],
   ["git commit -m 'fix'", "git commit"],
   ["git push origin main", "git push"],
   ["git -C /repo reset --hard", "git -C reset"],
   ["git clean -fd", "git clean"],
   ["git commit -m 'rm the old file'", "git commit mentioning rm in message"],
   ["ls && rm -rf src", "rm after &&"],
];

// Known misses, accepted (guard is for mistakes, not adversaries):
//   echo x | xargs rm        -- rm hidden behind xargs
//   sh -c "rm -rf /etc"     -- rm hidden behind sh -c
//   echo `rm -rf /`         -- rm hidden in backticks

const shouldPass: [string, string][] = [
   ["ls -la", "plain ls"],
   ["echo rm", "'rm' as an argument"],
   ["cat rm", "file named rm"],
   ["git log --oneline", "git log"],
   ["git status", "git status"],
   ["git add .", "git add"],
   ["npm run build", "npm run"],
   ["apt update", "apt update"],
   ["apk del curl", "apk del (not an install)"],
   ["pip install requests", "pip install (user-local, not system-wide)"],
   ["npm install lodash", "npm install (node_modules only)"],
   ["brew install wget", "brew install (not system-wide)"],
   ["rm -rf /tmp/build", "rm in /tmp"],
   ["rm /tmp/a /tmp/b", "rm multiple in /tmp"],
   ["rm -rf /var/tmp/junk", "rm in /var/tmp"],
   ["sudo rm -rf /tmp/cache", "sudo rm in /tmp"],
   ["rm -rf /tmp/*", "rm glob in /tmp"],
   ["cd /tmp && rm -rf scratch", "cd /tmp then rm relative"],
   ["cd /var/tmp && rm old.log", "cd /var/tmp then rm relative"],
   ["echo hi > /tmp/out.txt", "redirect to new file"],
   ["ls | grep foo; echo done", "pipes and semicolons"],
   ["echo $(date)", "benign command substitution"],
   ["FOO=bar ls", "env prefix"],
];

let failures = 0;
for (const [cmd, label] of shouldFlag) {
   const reason = check(cmd);
   if (!reason) {
      console.log(`MISS  ${label}: ${cmd}`);
      failures++;
   } else {
      console.log(`flag  ${label}: ${cmd}  -> ${reason}`);
   }
}
for (const [cmd, label] of shouldPass) {
   const reason = check(cmd);
   if (reason) {
      console.log(`FALSE POSITIVE  ${label}: ${cmd}  -> ${reason}`);
      failures++;
   } else {
      console.log(`ok    ${label}: ${cmd}`);
   }
}
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
