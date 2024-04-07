require('dotenv').config();
const express = require('express');

const app = express();
const port = process.env.PORT || 3001;
const cors = require('cors');
app.use(cors());

const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


async function generateTriviaQuestion(category) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{
        "role": "user",
        "content": `
          Generate a challenging trivia question related to ${category} including four multiple-choice answers (A, B, C, and D).
          Don't allow vulgar categories and if there's a category that's too long, condense it to create a category similar to it.
          Format the output as follows: category, question text, answer options in a list, and indicate the correct answer. Follow this structure:

          {
            "categoryId": "id of category we ended up with",
            "name": "formal category name for the UI to show",
            "questions": [
              "questionId": "question id",
              "question": "the trivia question",
              "answers": [
                {"answerId": "a1", "text": "First option"},
                {"answerId": "a2", "text": "Second option"},
                {"answerId": "a3", "text": "Third option"},
                {"answerId": "a4", "text": "Fourth option"}
              ],
              "correctAnswerId": "ID of the correct answer",
              "difficulty": "difficulty of question",
              "explanation": "explanation"
            ]
          }
        `
      }],
      temperature: 1,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    let content = response.choices[0].message.content;

    // Check and remove starting and ending backticks if present
    if (content.startsWith("```json") && content.endsWith("```")) {
      content = content.substring(7, content.length - 3); // Remove the initial ```json\n and the trailing \n```
    }

    // Now, content should be a valid JSON string
    const parsedContent = JSON.parse(content.trim());

    console.log('Parsed response: ', parsedContent);
    return parsedContent;

  } catch (e) {
    console.error(`Error generating question for category '${category}':`, e);
    return { error: "Failed to generate a question" };
  }
}

app.use(express.json());

app.get('/get-question', async (req, res) => {
  const { category } = req.query;
  if (!category) {
    res.status(400).send("Category is required");
    return;
  }

  const questionObject = await generateTriviaQuestion(category);
  if (questionObject.error) {
    res.status(500).send(questionObject.error);
  } else {
    res.json(questionObject);
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
