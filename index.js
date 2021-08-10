require("dotenv").config();
const cors = require("cors");

const puppeteer = require("puppeteer");
const express = require("express");
const formidable = require("express-formidable");
const mongoose = require("mongoose");

const app = express();
app.use(formidable());
app.use(cors());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
});

const Currency = require("./models/Currency");

const getRateFromUrl = async (url) => {
  // Lancement du navigateur
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--incognito", "--no-sandbox", "--single-process", "--no-zygote"],
  });
  const page = await browser.newPage();
  await page.goto(url);

  // Gestion de la fenêtre pop-up : accepter les cookies
  await page.waitForSelector("#didomi-notice-agree-button");
  await page.click("#didomi-notice-agree-button");

  // Saisie utilisateur
  await page.focus("#amount");
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500); // on attend que le navigateur affiche le résultat avant de scrapper le taux (sinon renvoie null)

  const rate = await page.evaluate(() => {
    return Number(
      document.querySelector(".c-currency-converter__convert-rate b").innerHTML
    );
  });

  await browser.close();

  return rate; // on renvoie le taux affiché sur le site
};

let isUpdating = false;
let messageToUser = "Calcul en cours ...";

app.get("/update", (req, res) => {
  let timer = 0;

  if (!isUpdating) {
    isUpdating = true;
    try {
      (async () => {
        // Lancement du navigateur

        console.log("--> Initialisation de Puppeteer");
        const browser = await puppeteer.launch({
          headless: true,
          args: [
            "--incognito",
            "--no-sandbox",
            "--single-process",
            "--no-zygote",
          ],
        });
        const page = await browser.newPage();
        await page.goto(process.env.SOURCE_URL);

        console.log("--> Récupération des url");
        // Récupération de toutes les conversions possibles ainsi que les url
        const listOfCurrencies = await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll("td a"));

          const list = el.map((el, i) => ({
            id: i,
            from: {
              currency: el.innerHTML.slice(3, 6),
              description: el.innerHTML.slice(12, 16),
            },
            to: {
              currency: el.innerHTML.slice(31, 34),
              description: el.innerHTML.slice(40, el.innerHTML.length - 1),
            },
            link: el.href,
          }));

          return list;
        });

        await browser.close();

        return listOfCurrencies;
      })() // Attente de la résolution de la promesse browser.close()
        .then(async (currencies) => {
          console.log("--> Début de la mise à jour des taux");

          setInterval(() => timer++, 1);
          const currenciesUpdated = currencies;

          // Mise à jour du taux pour chaque devise présente dans l'array 'result'
          for (let i = 0; i < currenciesUpdated.length; i++) {
            try {
              currenciesUpdated[i].rate = await getRateFromUrl(
                currenciesUpdated[i].link
              );
              currenciesUpdated[i].update = Date();
            } catch (error) {
              currenciesUpdated[i].rate = undefined;
              currenciesUpdated[i].update = undefined;
            }

            // Création d'une nouvelle devise et sauvegarde dans la base de données MongoDB
            const newCurrency = new Currency({
              from: {
                currency: currenciesUpdated[i].from.currency,
                description: currenciesUpdated[i].from.description,
              },
              to: {
                currency: currenciesUpdated[i].to.currency,
                description: currenciesUpdated[i].to.description,
              },
              link: currenciesUpdated[i].link,
              rate: currenciesUpdated[i].rate,
              update: currenciesUpdated[i].update,
            });

            if (newCurrency.rate) {
              // si on ne parvient pas à récupérer le taux on ne modifie pas la BDD
              try {
                await newCurrency.save();
              } catch (error) {
                console.log(error.message);
              }
            }

            // Affichage de l'avancement de la mise à jour dans la console
            messageToUser =
              i +
              1 +
              "/" +
              currenciesUpdated.length +
              " (" +
              (((i + 1) / currenciesUpdated.length) * 100).toFixed(2) +
              "%) - Temps écoulé : " +
              Math.floor(timer / 1000 / 60 / 60) +
              " h " +
              Math.floor(
                (timer - Math.floor(timer / 1000 / 60 / 60) * 60 * 1000) /
                  1000 /
                  60
              ) +
              " m " +
              (timer - Math.floor(timer / 1000 / 60) * 60 * 1000) / 1000 +
              " s";

            console.log(messageToUser);

            i === currenciesUpdated.length - 1 && (isUpdating = false); // on passe la variable isUpdating à false lorsque toute la màj est terminée
          }
        });
      res.status(200).json({
        message:
          "Update started. You can follow the progress by reloading page",
      });
    } catch (error) {
      isUpdating = false;
      res.status(400).json({ error: error.message });
    }
  } else {
    res
      .status(200)
      .json({ message: "Already in progress", progress: messageToUser });
  }
});

app.get("/rates", async (req, res) => {
  const rates = await Currency.find();

  res.status(200).json({ count: rates.length, data: rates });
});

app.listen(process.env.PORT, () => {
  console.log("Server listing port " + process.env.PORT);
});
