require("dotenv").config();
const { App } = require("@slack/bolt");
const { WebClient } = require("@slack/web-api");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

const creds = require("./credentials.json");

// Create a new instance of the WebClient with your Slack token
const slackClient = new WebClient(process.env.SLACK_TOKEN);

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const doc = new GoogleSpreadsheet(
  process.env.GOOGLE_SHEET_ID,
  serviceAccountAuth
);

// Define a function to get the email ID of a user
async function getUserEmail(userId) {
  try {
    // Call the users.info method with the user ID
    const response = await slackClient.users.info({ user: userId });

    // Extract the email ID from the response
    userEmail = response.user.profile.email;
  } catch (error) {
    console.error("Error occurred while getting user email:", error);
    throw error;
  }
}

let userEmail = "";

// Gets full profile details of the user
async function getUserProfile(userId) {
  try {
    const response = await slackClient.users.info({ user: userId });
    return response.user.profile;
  } catch (error) {
    console.error("Error occurred while getting user email:", error);
    throw error;
  }
}

app.message(/in|signin/i, async ({ message, say }) => {
  const helloMessage = `Hi <@${message.user}>,
Let's get you signed up for the day`;

  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: helloMessage,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Please select your work location",
        },
        accessory: {
          type: "static_select",
          placeholder: {
            type: "plain_text",
            text: "Select work location",
          },
          options: [
            {
              text: {
                type: "plain_text",
                text: "Work From Home",
              },
              value: "Work From Home",
            },
            {
              text: {
                type: "plain_text",
                text: "Work from Office",
              },
              value: "Work from Office",
            },
            {
              text: {
                type: "plain_text",
                text: "Client Location",
              },
              value: "Client Location",
            },
          ],
          action_id: "location-select",
        },
      },
    ],
    text: helloMessage,
  });
});

app.action("location-select", async ({ body, ack, say }) => {
  // Acknowledge the action
  await ack();
  // say() sends a message to the channel where the event was triggered
  await say({
    replace_original: true,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Ready to start your day? Sign In Now.",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Sign In",
            emoji: true,
          },
          value: `${body.actions[0].selected_option.value}`,
          action_id: "sign-in",
        },
      },
    ],
  });
  // Acknowledge the action
});

app.action("sign-in", async ({ body, ack, say, respond }) => {
  await getUserEmail(body.user.id);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Sheet1"];

  const payload = {
    Name: body.user.name,
    Email: userEmail,
    Location: body.actions[0].value,
    Date: new Date().toDateString(),
    Time: new Date().toLocaleTimeString(),
  };

  try {
    const currentDate = new Date().toDateString();
    const rows = await sheet.getRows();
    let isFound = false;
    for (let i = 0; i < rows.length; i++) {
      if (
        rows[i].get("Email") === userEmail &&
        rows[i].get("Date") === currentDate
      ) {
        await say({
          text: `You have already signed in for today.`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `You have already signed in for today.`,
              },
            },
          ],
        });
        isFound = true;
        return;
      }
    }
    if (!isFound) {
      await sheet.addRow(payload);
      await ack();
      await say({
        text: `<@${body.user.id}> you have signed in for today. Have a great day ahead!`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<@${body.user.id}> you have signed in for today. Have a great day ahead!`,
            },
          },
        ],
      });
    }
  } catch (error) {
    console.error("Error:", error);
  }
});

(async () => {
  // Start your app
  await app.start();
  console.log("⚡️ Bolt app is running!");
})();
