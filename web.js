app.get('/', (req, res) => {
    res.send('<h1>This server is powered by Whatsbot<br><a href="https://github.com/TheWhatsBot/WhatsBot">https://github.com/TheWhatsBot/WhatsBot</a></h1>')
})

app.use('/public', express.static('public'), serveIndex('public', { 'icons': true })) // public directory will be publicly available


app.listen(process.env.PORT || 8080, () => {
    console.log(`Server listening at Port: ${process.env.PORT || 8080}`)
})
